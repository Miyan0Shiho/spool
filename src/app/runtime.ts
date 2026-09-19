import { randomUUID } from "node:crypto";

import { ProcessManager } from "../execution/process-manager.js";
import { Workspace } from "../execution/workspace.js";
import type { PermissionBroker } from "../permissions/permission-manager.js";
import type { ModelProvider } from "../providers/provider.js";
import {
  AgentLoop,
  type AgentRunOutcome,
} from "../runtime/agent-loop.js";
import { SessionController } from "../runtime/session-controller.js";
import { SqliteEventStore } from "../storage/sqlite-store.js";
import type { ToolRegistry } from "../tools/tool-registry.js";

export interface RuntimeOptions {
  readonly databasePath: string;
  readonly permissions: PermissionBroker;
  readonly provider: ModelProvider;
  readonly sessionId?: string;
  readonly tools: ToolRegistry;
  readonly workspaceRoot: string;
}

export class SpoolRuntime {
  readonly permissions: PermissionBroker;
  readonly provider: ModelProvider;
  readonly sessionId: string;
  readonly store: SqliteEventStore;
  readonly tools: ToolRegistry;
  readonly workspace: Workspace;
  readonly #controller: SessionController;
  readonly #loop: AgentLoop;
  readonly #processManager: ProcessManager;

  constructor(options: RuntimeOptions) {
    this.permissions = options.permissions;
    this.provider = options.provider;
    this.sessionId = options.sessionId ?? "default";
    this.store = new SqliteEventStore(options.databasePath);
    this.tools = options.tools;
    this.workspace = new Workspace(options.workspaceRoot);
    this.#controller = new SessionController(this.store);
    this.#loop = new AgentLoop(this.store);
    this.#processManager = new ProcessManager();
  }

  async run(
    input: string,
    signal: AbortSignal,
    onStream?: Parameters<AgentLoop["run"]>[0]["onStream"],
  ): Promise<{
    readonly outcome: AgentRunOutcome;
    readonly runId: string;
  }> {
    const accepted = this.#controller.acceptInput(
      randomUUID(),
      this.sessionId,
      input,
    );
    const runId = randomUUID();
    this.#controller.createRun(
      randomUUID(),
      this.sessionId,
      runId,
      accepted.event.eventId,
    );
    const outcome = await this.#loop.run({
      input,
      permissions: this.permissions,
      provider: this.provider,
      runId,
      sessionId: this.sessionId,
      signal,
      ...(onStream ? { onStream } : {}),
      toolContext: {
        artifacts: this.store,
        processManager: this.#processManager,
        runId,
        sessionId: this.sessionId,
        workspace: this.workspace,
      },
      tools: this.tools,
    });
    return { outcome, runId };
  }

  async close(): Promise<void> {
    await Promise.all(
      this.#processManager.list().map(async (handle) => {
        await handle.cancel();
        handle.cleanup();
      }),
    );
    this.store.close();
  }
}
