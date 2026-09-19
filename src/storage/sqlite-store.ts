import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { CommandConflictError, RunStateError } from "../contracts/errors.js";
import type {
  EventDraft,
  EventType,
  PersistedEvent,
} from "../contracts/events.js";
import type { JsonValue } from "../contracts/json.js";
import type {
  ArtifactStore,
  InputReceipt,
  RunReceipt,
  RuntimeStore,
  StoredArtifact,
} from "./store.js";

interface CommandRow {
  readonly event_id: string;
  readonly kind: string;
  readonly payload_json: string;
}

interface EventRow {
  readonly created_at: string;
  readonly event_id: string;
  readonly payload_json: string;
  readonly run_id: string | null;
  readonly session_id: string;
  readonly seq: number;
  readonly type: EventType;
}

interface RunRow {
  readonly session_id: string;
  readonly status: string;
}

interface ArtifactRow {
  readonly artifact_id: string;
  readonly media_type: string;
  readonly path: string;
  readonly sha256: string;
  readonly size_bytes: number;
}

interface SqliteEventStoreOptions {
  readonly artifactRoot?: string;
  readonly timeoutMs?: number;
}

const schemaVersion = 2;

function now(): string {
  return new Date().toISOString();
}

function eventDraft(
  sessionId: string,
  runId: string | null,
  type: EventType,
  payload: JsonValue,
): EventDraft {
  return {
    createdAt: now(),
    eventId: randomUUID(),
    payload,
    runId,
    sessionId,
    type,
  };
}

export class SqliteEventStore implements RuntimeStore, ArtifactStore {
  readonly #artifactRoot: string;
  readonly #database: DatabaseSync;

  constructor(path: string, options: SqliteEventStoreOptions = {}) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.#artifactRoot =
      options.artifactRoot ??
      (path === ":memory:"
        ? join(
            tmpdir(),
            `spool-artifacts-${randomUUID()}`,
          )
        : join(dirname(path), "artifacts"));
    mkdirSync(this.#artifactRoot, { recursive: true });

    this.#database = new DatabaseSync(path, {
      enableForeignKeyConstraints: true,
      timeout: options.timeoutMs ?? 3_000,
    });
    try {
      this.#database.exec("PRAGMA journal_mode = WAL");
      this.#database.exec("PRAGMA synchronous = FULL");
      this.#database.exec("PRAGMA foreign_keys = ON");
      if (process.platform === "darwin" && path !== ":memory:") {
        this.#database.exec("PRAGMA fullfsync = ON");
      }

      if (path === ":memory:") {
        this.#migrate();
        this.#recoverInterruptedRuns();
      } else {
        this.#database.exec("PRAGMA locking_mode = EXCLUSIVE");
        this.#database.exec("BEGIN EXCLUSIVE");
        try {
          this.#migrate();
          this.#recoverInterruptedRuns();
          this.#database.exec("COMMIT");
        } catch (error) {
          this.#database.exec("ROLLBACK");
          throw error;
        }
      }
    } catch (error) {
      this.#database.close();
      throw error;
    }
  }

  acceptInput(
    commandId: string,
    sessionId: string,
    input: string,
  ): InputReceipt {
    return this.#transaction(() => {
      const payload: JsonValue = { input, sessionId };
      const existing = this.#findCommand(commandId);
      if (existing) {
        this.#assertCommand(commandId, existing, "accept-input", payload);
        return {
          duplicate: true,
          event: this.#readEvent(existing.event_id),
        };
      }

      this.#database
        .prepare(
          "INSERT OR IGNORE INTO sessions (session_id, created_at, updated_at) VALUES (?, ?, ?)",
        )
        .run(sessionId, now(), now());
      const event = this.#appendEventInternal(
        eventDraft(sessionId, null, "input/received", payload),
      );
      this.#insertCommand(commandId, "accept-input", payload, event.eventId);
      return { duplicate: false, event };
    });
  }

  appendEvent(event: EventDraft): PersistedEvent {
    return this.#transaction(() => this.#appendEventInternal(event));
  }

  claimRun(runId: string, sessionId: string): boolean {
    return this.#transaction(() => {
      const run = this.#readRun(runId);
      if (run.session_id !== sessionId) {
        return false;
      }
      const result = this.#database
        .prepare(
          "UPDATE runs SET status = 'running', updated_at = ? WHERE run_id = ? AND status = 'queued'",
        )
        .run(now(), runId);
      if (Number(result.changes) !== 1) {
        return false;
      }

      this.#appendEventInternal(
        eventDraft(run.session_id, runId, "run/claimed", { status: "running" }),
      );
      return true;
    });
  }

  close(): void {
    this.#database.close();
  }

  createRun(
    commandId: string,
    sessionId: string,
    runId: string,
    inputEventId: string,
  ): RunReceipt {
    return this.#transaction(() => {
      const payload: JsonValue = { inputEventId, runId, sessionId };
      const existing = this.#findCommand(commandId);
      if (existing) {
        this.#assertCommand(commandId, existing, "create-run", payload);
        return { duplicate: true, runId };
      }

      const session = this.#database
        .prepare("SELECT session_id FROM sessions WHERE session_id = ?")
        .get(sessionId);
      if (!session) {
        throw new RunStateError(runId, `session ${sessionId} does not exist`);
      }
      const inputEvent = this.#database
        .prepare("SELECT session_id, type FROM events WHERE event_id = ?")
        .get(inputEventId) as unknown as
        | { readonly session_id: string; readonly type: EventType }
        | undefined;
      if (
        !inputEvent ||
        inputEvent.type !== "input/received" ||
        inputEvent.session_id !== sessionId
      ) {
        throw new RunStateError(
          runId,
          `input event ${inputEventId} is not valid for session ${sessionId}`,
        );
      }

      const createdAt = now();
      this.#database
        .prepare(
          "INSERT INTO runs (run_id, session_id, status, created_at, updated_at) VALUES (?, ?, 'queued', ?, ?)",
        )
        .run(runId, sessionId, createdAt, createdAt);
      const event = this.#appendEventInternal(
        eventDraft(sessionId, runId, "run/created", {
          inputEventId,
          status: "queued",
        }),
      );
      this.#insertCommand(commandId, "create-run", payload, event.eventId);
      return { duplicate: false, runId };
    });
  }

  finishRun(
    runId: string,
    status: "cancelled" | "completed" | "failed",
    reason: string,
  ): PersistedEvent {
    return this.#transaction(() => {
      const run = this.#readRun(runId);
      if (run.status !== "running") {
        throw new RunStateError(
          runId,
          `cannot finish run in state ${run.status}`,
        );
      }

      this.#database
        .prepare("UPDATE runs SET status = ?, updated_at = ? WHERE run_id = ?")
        .run(status, now(), runId);
      const eventType: EventType =
        status === "completed"
          ? "run/completed"
          : status === "cancelled"
            ? "run/cancelled"
            : "run/failed";
      return this.#appendEventInternal(
        eventDraft(run.session_id, runId, eventType, { reason, status }),
      );
    });
  }

  putArtifact(
    content: Uint8Array,
    mediaType: string,
    context?: {
      readonly runId: string | null;
      readonly sessionId: string;
    },
  ): StoredArtifact {
    const sha256 = createHash("sha256").update(content).digest("hex");
    const artifactId = `sha256:${sha256}`;
    const directory = join(this.#artifactRoot, sha256.slice(0, 2));
    const path = join(directory, sha256);
    mkdirSync(directory, { recursive: true });

    if (!existsSync(path)) {
      const temporaryPath = `${path}.${randomUUID()}.tmp`;
      const descriptor = openSync(temporaryPath, "wx", 0o600);
      try {
        writeFileSync(descriptor, content);
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      try {
        renameSync(temporaryPath, path);
        const directoryDescriptor = openSync(directory, "r");
        try {
          fsyncSync(directoryDescriptor);
        } finally {
          closeSync(directoryDescriptor);
        }
      } catch (error) {
        if (existsSync(temporaryPath)) {
          unlinkSync(temporaryPath);
        }
        throw error;
      }
    }

    return this.#transaction(() => {
      const existing = this.#readArtifactRow(artifactId);
      if (existing) {
        return this.#artifactFromRow(existing);
      }

      this.#database
        .prepare(
          `INSERT INTO artifacts
            (artifact_id, sha256, size_bytes, media_type, storage_path, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          artifactId,
          sha256,
          content.byteLength,
          mediaType,
          path,
          now(),
        );
      if (context) {
        this.#appendEventInternal(
          eventDraft(context.sessionId, context.runId, "artifact/stored", {
            artifactId,
            mediaType,
            sha256,
            sizeBytes: content.byteLength,
          }),
        );
      }
      return {
        artifactId,
        mediaType,
        path,
        sha256,
        sizeBytes: content.byteLength,
      };
    });
  }

  readArtifact(
    artifactId: string,
  ): { readonly artifact: StoredArtifact; readonly content: Uint8Array } {
    const row = this.#readArtifactRow(artifactId);
    if (!row) {
      throw new Error(`artifact ${artifactId} does not exist`);
    }
    const content = new Uint8Array(readFileSync(row.path));
    const sha256 = createHash("sha256").update(content).digest("hex");
    if (content.byteLength !== Number(row.size_bytes) || sha256 !== row.sha256) {
      throw new Error(`artifact ${artifactId} failed integrity verification`);
    }
    return {
      artifact: this.#artifactFromRow(row),
      content,
    };
  }

  readEvents(sessionId?: string): PersistedEvent[] {
    const rows = sessionId
      ? this.#database
          .prepare(
            "SELECT * FROM events WHERE session_id = ? ORDER BY seq ASC",
          )
          .all(sessionId)
      : this.#database
          .prepare("SELECT * FROM events ORDER BY seq ASC")
          .all();
    return rows.map((row) => this.#eventFromRow(row as unknown as EventRow));
  }

  recordToolIntent(
    sessionId: string,
    runId: string,
    callId: string,
    toolName: string,
    input: JsonValue,
  ): PersistedEvent {
    return this.appendEvent(
      eventDraft(sessionId, runId, "tool/intent", {
        callId,
        input,
        toolName,
      }),
    );
  }

  recordToolResult(
    sessionId: string,
    runId: string,
    callId: string,
    status: "aborted" | "error" | "ok" | "unknown",
    output: JsonValue,
  ): PersistedEvent {
    return this.appendEvent(
      eventDraft(sessionId, runId, "tool/result", {
        callId,
        output,
        status,
      }),
    );
  }

  #appendEventInternal(event: EventDraft): PersistedEvent {
    const result = this.#database
      .prepare(
        `INSERT INTO events
          (event_id, session_id, run_id, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.eventId,
        event.sessionId,
        event.runId,
        event.type,
        JSON.stringify(event.payload),
        event.createdAt,
      );
    return {
      ...event,
      seq: Number(result.lastInsertRowid),
    };
  }

  #assertCommand(
    commandId: string,
    row: CommandRow,
    expectedKind: string,
    expectedPayload: JsonValue,
  ): void {
    const payload = JSON.stringify(expectedPayload);
    if (row.kind !== expectedKind || row.payload_json !== payload) {
      throw new CommandConflictError(commandId);
    }
  }

  #eventFromRow(row: EventRow): PersistedEvent {
    return {
      createdAt: row.created_at,
      eventId: row.event_id,
      payload: JSON.parse(row.payload_json) as JsonValue,
      runId: row.run_id,
      seq: Number(row.seq),
      sessionId: row.session_id,
      type: row.type,
    };
  }

  #findCommand(commandId: string): CommandRow | undefined {
    return this.#database
      .prepare(
        "SELECT event_id, kind, payload_json FROM commands WHERE command_id = ?",
      )
      .get(commandId) as unknown as CommandRow | undefined;
  }

  #insertCommand(
    commandId: string,
    kind: string,
    payload: JsonValue,
    eventId: string,
  ): void {
    this.#database
      .prepare(
        `INSERT INTO commands
          (command_id, kind, payload_json, event_id, accepted_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(commandId, kind, JSON.stringify(payload), eventId, now());
  }

  #migrate(): void {
    const current = Number(
      (
        this.#database.prepare("PRAGMA user_version").get() as
          | { readonly user_version?: number }
          | undefined
      )?.user_version ?? 0,
    );
    if (current > schemaVersion) {
      throw new Error(
        `database schema ${current} is newer than supported ${schemaVersion}`,
      );
    }

    if (current < 1) {
      this.#database.exec(`
        CREATE TABLE sessions (
          session_id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE runs (
          run_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(session_id),
          status TEXT NOT NULL CHECK (
            status IN ('queued', 'running', 'completed', 'cancelled', 'failed')
          ),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL UNIQUE,
          session_id TEXT NOT NULL REFERENCES sessions(session_id),
          run_id TEXT REFERENCES runs(run_id),
          type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE commands (
          command_id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          event_id TEXT NOT NULL REFERENCES events(event_id),
          accepted_at TEXT NOT NULL
        ) STRICT;

        CREATE INDEX events_session_seq ON events(session_id, seq);
        CREATE INDEX events_run_seq ON events(run_id, seq);
        PRAGMA user_version = 1;
      `);
    }

    if (current < 2) {
      this.#database.exec(`
        CREATE TABLE artifacts (
          artifact_id TEXT PRIMARY KEY,
          sha256 TEXT NOT NULL UNIQUE,
          size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
          media_type TEXT NOT NULL,
          storage_path TEXT NOT NULL,
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE INDEX artifacts_sha256 ON artifacts(sha256);
        PRAGMA user_version = 2;
      `);
    }
  }

  #artifactFromRow(row: ArtifactRow): StoredArtifact {
    return {
      artifactId: row.artifact_id,
      mediaType: row.media_type,
      path: row.path,
      sha256: row.sha256,
      sizeBytes: Number(row.size_bytes),
    };
  }

  #readEvent(eventId: string): PersistedEvent {
    const row = this.#database
      .prepare("SELECT * FROM events WHERE event_id = ?")
      .get(eventId) as unknown as EventRow | undefined;
    if (!row) {
      throw new Error(`event ${eventId} is missing`);
    }
    return this.#eventFromRow(row);
  }

  #readArtifactRow(artifactId: string): ArtifactRow | undefined {
    return this.#database
      .prepare(
        `SELECT artifact_id, sha256, size_bytes, media_type, storage_path AS path
         FROM artifacts WHERE artifact_id = ?`,
      )
      .get(artifactId) as unknown as ArtifactRow | undefined;
  }

  #readRun(runId: string): RunRow {
    const row = this.#database
      .prepare("SELECT session_id, status FROM runs WHERE run_id = ?")
      .get(runId) as unknown as RunRow | undefined;
    if (!row) {
      throw new RunStateError(runId, `run ${runId} does not exist`);
    }
    return row;
  }

  #recoverInterruptedRuns(): void {
    const rows = this.#database
      .prepare("SELECT run_id, session_id, status FROM runs")
      .all() as unknown as {
      readonly run_id: string;
      readonly session_id: string;
      readonly status: string;
    }[];
    for (const row of rows) {
      const events = this.#database
        .prepare(
          "SELECT type, payload_json FROM events WHERE run_id = ? ORDER BY seq ASC",
        )
        .all(row.run_id) as unknown as {
        readonly payload_json: string;
        readonly type: EventType;
      }[];
      const unsettledCalls = new Map<string, JsonValue>();
      for (const event of events) {
        const payload = JSON.parse(event.payload_json) as JsonValue;
        if (
          (event.type === "tool/intent" || event.type === "tool/result") &&
          payload !== null &&
          typeof payload === "object" &&
          !Array.isArray(payload) &&
          typeof payload.callId === "string"
        ) {
          if (event.type === "tool/intent") {
            unsettledCalls.set(payload.callId, payload.input ?? null);
          } else {
            unsettledCalls.delete(payload.callId);
          }
        }
      }
      for (const callId of unsettledCalls.keys()) {
        this.#appendEventInternal(
          eventDraft(row.session_id, row.run_id, "tool/result", {
            callId,
            output: {
              dispatched: true,
              reason: "recovered-unsettled-tool",
            },
            status: "unknown",
          }),
        );
      }
      if (row.status === "running") {
        this.#database
          .prepare(
            "UPDATE runs SET status = 'failed', updated_at = ? WHERE run_id = ? AND status = 'running'",
          )
          .run(now(), row.run_id);
        this.#appendEventInternal(
          eventDraft(row.session_id, row.run_id, "run/failed", {
            reason: "recovered-interrupted-run",
            recovered: true,
            status: "failed",
          }),
        );
      }
    }
  }

  #transaction<T>(operation: () => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}
