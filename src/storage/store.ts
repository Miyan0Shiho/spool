import type { EventDraft, PersistedEvent } from "../contracts/events.js";
import type { JsonValue } from "../contracts/json.js";

export interface InputReceipt {
  readonly duplicate: boolean;
  readonly event: PersistedEvent;
}

export interface RunReceipt {
  readonly duplicate: boolean;
  readonly runId: string;
}

export interface RuntimeStore {
  acceptInput(
    commandId: string,
    sessionId: string,
    input: string,
  ): InputReceipt;
  appendEvent(event: EventDraft): PersistedEvent;
  claimRun(runId: string, sessionId: string): boolean;
  close(): void;
  createRun(
    commandId: string,
    sessionId: string,
    runId: string,
    inputEventId: string,
  ): RunReceipt;
  finishRun(
    runId: string,
    status: "cancelled" | "completed" | "failed",
    reason: string,
  ): PersistedEvent;
  readEvents(sessionId?: string): PersistedEvent[];
  recordToolIntent(
    sessionId: string,
    runId: string,
    callId: string,
    toolName: string,
    input: JsonValue,
  ): PersistedEvent;
  recordToolResult(
    sessionId: string,
    runId: string,
    callId: string,
    status: "aborted" | "error" | "ok" | "unknown",
    output: JsonValue,
  ): PersistedEvent;
}

export interface StoredArtifact {
  readonly artifactId: string;
  readonly mediaType: string;
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

export interface ArtifactStore {
  putArtifact(
    content: Uint8Array,
    mediaType: string,
    context?: {
      readonly runId: string | null;
      readonly sessionId: string;
    },
  ): StoredArtifact;
  readArtifact(
    artifactId: string,
  ): { readonly artifact: StoredArtifact; readonly content: Uint8Array };
}
