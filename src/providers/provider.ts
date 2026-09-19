import {
  isJsonValue,
  type JsonObject,
  type JsonValue,
} from "../contracts/json.js";

export interface ProviderToolCall {
  readonly callId: string;
  readonly input: JsonValue;
  readonly name: string;
}

export interface ProviderUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

export interface ProviderOpaqueArtifact {
  readonly payload: JsonValue;
  readonly provider: string;
}

export type ProviderStreamEvent =
  | {
      readonly type: "opaque";
      readonly artifact: ProviderOpaqueArtifact;
    }
  | {
      readonly type: "text_delta";
      readonly text: string;
    }
  | {
      readonly argumentsDelta?: string;
      readonly callId?: string;
      readonly index: number;
      readonly name?: string;
      readonly type: "tool_call_delta";
    }
  | {
      readonly type: "usage";
      readonly usage: ProviderUsage;
    };

export interface ProviderMessageBase {
  readonly role: "assistant" | "tool" | "user";
}

export interface ProviderUserMessage extends ProviderMessageBase {
  readonly content: string;
  readonly role: "user";
}

export interface ProviderAssistantMessage extends ProviderMessageBase {
  readonly content: string;
  readonly opaqueArtifacts: readonly ProviderOpaqueArtifact[];
  readonly role: "assistant";
  readonly toolCalls: readonly ProviderToolCall[];
}

export interface ProviderToolMessage extends ProviderMessageBase {
  readonly content: JsonValue;
  readonly role: "tool";
  readonly toolCallId: string;
}

export type ProviderMessage =
  | ProviderAssistantMessage
  | ProviderToolMessage
  | ProviderUserMessage;

export interface ToolDescriptor {
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly name: string;
}

export interface ProviderMetadata {
  readonly model: string;
  readonly protocol: string;
  readonly provider: string;
}

export class ProviderHttpError extends Error {
  readonly code: string | null;
  readonly requestId: string | null;
  readonly retryable: boolean;
  readonly status: number;

  constructor(options: {
    readonly code?: string | null;
    readonly message: string;
    readonly requestId?: string | null;
    readonly retryable: boolean;
    readonly status: number;
  }) {
    super(options.message);
    this.name = "ProviderHttpError";
    this.code = options.code ?? null;
    this.requestId = options.requestId ?? null;
    this.retryable = options.retryable;
    this.status = options.status;
  }
}

export class ProviderStreamError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProviderStreamError";
    this.code = code;
  }
}

export type ProviderResponse =
  | {
      readonly opaqueArtifacts?: readonly ProviderOpaqueArtifact[];
      readonly text: string;
      readonly type: "final";
      readonly usage?: ProviderUsage;
    }
  | {
      readonly calls: readonly ProviderToolCall[];
      readonly opaqueArtifacts?: readonly ProviderOpaqueArtifact[];
      readonly text: string;
      readonly type: "tool_calls";
      readonly usage?: ProviderUsage;
    };

export interface ProviderRequest {
  readonly input: string;
  readonly messages: readonly ProviderMessage[];
  readonly runId: string;
  readonly sessionId: string;
  readonly step: number;
  readonly tools: readonly ToolDescriptor[];
  readonly onStream?: (event: ProviderStreamEvent) => void;
}

export interface ModelProvider {
  metadata(): ProviderMetadata;
  next(
    request: ProviderRequest,
    signal: AbortSignal,
  ): Promise<ProviderResponse>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isProviderResponse(
  value: unknown,
): value is ProviderResponse {
  if (!isRecord(value) || typeof value.text !== "string") {
    return false;
  }
  if (value.type === "final") {
    return true;
  }
  if (value.type !== "tool_calls" || !Array.isArray(value.calls)) {
    return false;
  }
  return value.calls.every(
    (call) =>
      isRecord(call) &&
      typeof call.callId === "string" &&
      call.callId.length > 0 &&
      typeof call.name === "string" &&
      call.name.length > 0 &&
      isJsonValue(call.input),
  );
}
