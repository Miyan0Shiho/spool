import type { JsonObject, JsonValue } from "../contracts/json.js";
import {
  boundText,
  outputJson,
  type OutputContext,
} from "../execution/output.js";
import type {
  ProcessHandle,
  ProcessManager,
} from "../execution/process-manager.js";
import { WorkspaceViolationError } from "../execution/workspace.js";
import {
  optionalBoolean,
  optionalInteger,
  optionalString,
  readObject,
  requireString,
} from "./input.js";
import type {
  Tool,
  ToolInvocationContext,
  ToolResult,
} from "./tool-registry.js";

const defaultMaxBytes = 256 * 1024;

function errorResult(error: unknown): ToolResult {
  return {
    output: {
      code:
        error instanceof WorkspaceViolationError
          ? "workspace-violation"
          : "tool-error",
      message: error instanceof Error ? error.message : String(error),
    },
    status: "error",
  };
}

function objectInput(input: JsonValue): JsonObject {
  const object = readObject(input);
  if (!object) {
    throw new Error("input must be an object");
  }
  return object;
}

function requireWorkspace(context: ToolInvocationContext) {
  if (!context.workspace) {
    throw new Error("workspace context is required");
  }
  return context.workspace;
}

function requireManager(context: ToolInvocationContext): ProcessManager {
  if (!context.processManager) {
    throw new Error("process manager context is required");
  }
  return context.processManager;
}

function handleJson(handle: ProcessHandle): JsonObject {
  return {
    id: handle.id,
    pgid: handle.pgid,
    pid: handle.pid,
    running: handle.running,
    startedAt: handle.startedAt,
  };
}

function outputContext(context: ToolInvocationContext): OutputContext {
  return {
    ...(context.artifacts ? { artifacts: context.artifacts } : {}),
    ...(context.runId ? { runId: context.runId } : {}),
    ...(context.sessionId ? { sessionId: context.sessionId } : {}),
  };
}

function boundedOutput(text: string, maxBytes: number, context: ToolInvocationContext) {
  return outputJson(boundText(text, maxBytes, outputContext(context)));
}

const shellTool: Tool = {
  description:
    "Run a Bash command inside the workspace. Supports foreground execution, timeout, cancellation, and background jobs.",
  effect: "process",
  inputSchema: {
    additionalProperties: false,
    properties: {
      background: { type: "boolean" },
      command: { type: "string" },
      cwd: { type: "string" },
      maxBytes: { type: "integer" },
      timeoutMs: { type: "integer" },
    },
    required: ["command"],
    type: "object",
  },
  name: "shell",
  async invoke(input, context) {
    try {
      const object = objectInput(input);
      const workspace = requireWorkspace(context);
      const manager = requireManager(context);
      const command = requireString(object, "command");
      const cwd = workspace.resolveRead(optionalString(object, "cwd") ?? ".");
      const background = optionalBoolean(object, "background") ?? false;
      const timeoutMs = Math.min(
        Math.max(optionalInteger(object, "timeoutMs") ?? 30_000, 1),
        10 * 60_000,
      );
      const maxBytes = Math.max(
        optionalInteger(object, "maxBytes") ?? defaultMaxBytes,
        1,
      );

      if (background) {
        const handle = manager.start({
          command,
          cwd,
          maxPreviewBytes: maxBytes,
          sandbox: { workspaceRoot: workspace.root },
          timeoutMs,
        });
        return {
          output: { background: true, job: handleJson(handle) },
          status: "ok",
        };
      }

      const result = await manager.run(
        {
          command,
          cwd,
          maxPreviewBytes: maxBytes,
          sandbox: { workspaceRoot: workspace.root },
          timeoutMs,
        },
        context.signal,
      );
      const output = manager.output(result.handle);
      const stdout = manager.readOutputFile(output.stdout.path);
      const stderr = manager.readOutputFile(output.stderr.path);
      const outputValue = {
        exit: {
          code: result.close.code,
          signal: result.close.signal,
        },
        stderr: boundedOutput(stderr, maxBytes, context),
        stdout: boundedOutput(stdout, maxBytes, context),
        aborted: result.aborted,
        timedOut: result.timedOut,
      };
      result.handle.cleanup();
      return {
        output: outputValue,
        status:
          result.close.code === 0 && !result.timedOut && !result.aborted
            ? "ok"
            : "error",
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

const jobReadTool: Tool = {
  description:
    "Read the current bounded stdout and stderr preview for a background job.",
  effect: "read",
  inputSchema: {
    additionalProperties: false,
    properties: {
      jobId: { type: "string" },
      maxBytes: { type: "integer" },
    },
    required: ["jobId"],
    type: "object",
  },
  name: "job_read",
  async invoke(input, context) {
    try {
      const object = objectInput(input);
      const manager = requireManager(context);
      const jobId = requireString(object, "jobId");
      const handle = manager.list().find((job) => job.id === jobId);
      if (!handle) {
        throw new Error(`job ${jobId} does not exist`);
      }
      const maxBytes = Math.max(
        optionalInteger(object, "maxBytes") ?? defaultMaxBytes,
        1,
      );
      const output = manager.output(handle);
      return {
        output: {
          job: handleJson(handle),
          stderr: boundedOutput(output.stderr.preview, maxBytes, context),
          stdout: boundedOutput(output.stdout.preview, maxBytes, context),
        },
        status: "ok",
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

const jobKillTool: Tool = {
  description:
    "Terminate a background job process group and report residual state.",
  effect: "process",
  inputSchema: {
    additionalProperties: false,
    properties: { jobId: { type: "string" } },
    required: ["jobId"],
    type: "object",
  },
  name: "job_kill",
  async invoke(input, context) {
    try {
      const object = objectInput(input);
      const manager = requireManager(context);
      const jobId = requireString(object, "jobId");
      const handle = manager.list().find((job) => job.id === jobId);
      if (!handle) {
        throw new Error(`job ${jobId} does not exist`);
      }
      const termination = await handle.cancel();
      const close = await handle.close(1_000);
      return {
        output: {
          close: {
            closeTimedOut: close.closeTimedOut,
            code: close.code,
            signal: close.signal,
          },
          forced: termination.forced,
          residual: termination.residual,
        },
        status: termination.residual ? "unknown" : "ok",
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

const jobListTool: Tool = {
  description: "List background jobs started in this runtime process.",
  effect: "read",
  inputSchema: {
    additionalProperties: false,
    properties: {},
    type: "object",
  },
  name: "job_list",
  async invoke(_input, context) {
    try {
      const manager = requireManager(context);
      return {
        output: {
          jobs: manager.list().map(handleJson),
        },
        status: "ok",
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

export const shellTools: readonly Tool[] = [
  shellTool,
  jobReadTool,
  jobKillTool,
  jobListTool,
];
