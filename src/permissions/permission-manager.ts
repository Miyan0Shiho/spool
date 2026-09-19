import type { JsonValue } from "../contracts/json.js";
import type { Tool } from "../tools/tool-registry.js";

export interface PermissionRequest {
  readonly callId: string;
  readonly input: JsonValue;
  readonly tool: Tool;
}

export interface PermissionDecision {
  readonly action: "allow" | "deny";
  readonly reason: string;
  readonly source: "approval" | "policy";
}

export type ApprovalHandler = (
  request: PermissionRequest,
  signal: AbortSignal,
) => Promise<boolean>;

export interface PermissionBroker {
  authorize(
    request: PermissionRequest,
    signal: AbortSignal,
  ): Promise<PermissionDecision>;
}

const dangerousCommandPatterns = [
  /(^|\s)sudo(\s|$)/,
  /(^|\s)rm\s+-rf\s+\/(?:\s|$)/,
  /git\s+reset\s+--hard/,
  /git\s+clean\s+-[a-z]*f/,
  /curl[^|]*\|\s*(?:sh|bash)/,
];

export class PermissionManager implements PermissionBroker {
  readonly #approvalHandler: ApprovalHandler | undefined;

  constructor(options: { readonly approvalHandler?: ApprovalHandler } = {}) {
    this.#approvalHandler = options.approvalHandler;
  }

  async authorize(
    request: PermissionRequest,
    signal: AbortSignal,
  ): Promise<PermissionDecision> {
    if (request.tool.effect === "read") {
      return {
        action: "allow",
        reason: "read-only tool",
        source: "policy",
      };
    }

    if (
      request.tool.effect === "process" &&
      isDangerousCommand(request.input)
    ) {
      return {
        action: "deny",
        reason: "command matches a destructive default deny rule",
        source: "policy",
      };
    }

    if (signal.aborted) {
      return {
        action: "deny",
        reason: "permission request was cancelled",
        source: "policy",
      };
    }

    if (!this.#approvalHandler) {
      return {
        action: "deny",
        reason: "approval is unavailable",
        source: "policy",
      };
    }

    const allowed = await this.#approvalHandler(request, signal);
    return allowed
      ? {
          action: "allow",
          reason: "approved for this call",
          source: "approval",
        }
      : {
          action: "deny",
          reason: "approval rejected",
          source: "approval",
        };
  }
}

function isDangerousCommand(input: JsonValue): boolean {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return false;
  }
  const command = input.command;
  return (
    typeof command === "string" &&
    dangerousCommandPatterns.some((pattern) => pattern.test(command))
  );
}
