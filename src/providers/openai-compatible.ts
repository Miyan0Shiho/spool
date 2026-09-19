import type { JsonObject, JsonValue } from "../contracts/json.js";
import {
  ProviderHttpError,
  ProviderStreamError,
  type ModelProvider,
  type ProviderMessage,
  type ProviderMetadata,
  type ProviderOpaqueArtifact,
  type ProviderRequest,
  type ProviderResponse,
  type ProviderToolCall,
  type ProviderUsage,
} from "./provider.js";

export interface OpenAICompatibleOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly maxOutputTokens?: number;
  readonly model: string;
  readonly providerName: string;
  readonly requestTimeoutMs?: number;
  readonly systemPrompt?: string;
}

interface ToolCallAccumulator {
  arguments: string;
  id: string;
  name: string;
}

interface OpenAIUsage {
  readonly completion_tokens?: number;
  readonly prompt_tokens?: number;
}

function stringifyToolContent(content: JsonValue): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}

function toOpenAIMessage(message: ProviderMessage): JsonObject {
  if (message.role === "user") {
    return { content: message.content, role: "user" };
  }
  if (message.role === "assistant") {
    return {
      content: message.content,
      role: "assistant",
      ...(message.toolCalls.length > 0
        ? {
            tool_calls: message.toolCalls.map((call) => ({
              function: {
                arguments: JSON.stringify(call.input),
                name: call.name,
              },
              id: call.callId,
              type: "function",
            })),
          }
        : {}),
    };
  }
  return {
    content: stringifyToolContent(message.content),
    role: "tool",
    tool_call_id: message.toolCallId,
  };
}

function normalizeUsage(value: unknown): ProviderUsage | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const usage = value as OpenAIUsage;
  return {
    inputTokens:
      typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
    outputTokens:
      typeof usage.completion_tokens === "number"
        ? usage.completion_tokens
        : null,
  };
}

function parseErrorBody(text: string): {
  readonly code: string | null;
  readonly message: string;
} {
  try {
    const parsed = JSON.parse(text) as {
      readonly error?: {
        readonly code?: unknown;
        readonly message?: unknown;
        readonly type?: unknown;
      };
    };
    const error = parsed.error;
    return {
      code:
        typeof error?.code === "string"
          ? error.code
          : typeof error?.type === "string"
            ? error.type
            : null,
      message:
        typeof error?.message === "string" ? error.message : "provider error",
    };
  } catch {
    return {
      code: null,
      message: text.slice(0, 1_000) || "provider error",
    };
  }
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly #options: OpenAICompatibleOptions;

  constructor(options: OpenAICompatibleOptions) {
    this.#options = options;
  }

  metadata(): ProviderMetadata {
    return {
      model: this.#options.model,
      protocol: "openai-chat-completions",
      provider: this.#options.providerName,
    };
  }

  async next(
    request: ProviderRequest,
    signal: AbortSignal,
  ): Promise<ProviderResponse> {
    const messages = [
      ...(this.#options.systemPrompt
        ? [{ content: this.#options.systemPrompt, role: "system" }]
        : []),
      ...request.messages.map(toOpenAIMessage),
    ];
    const body: JsonObject = {
      messages: messages as JsonValue,
      model: this.#options.model,
      stream: true,
      stream_options: { include_usage: true },
      tools: request.tools.map((tool) => ({
        function: {
          description: tool.description,
          name: tool.name,
          parameters: tool.inputSchema,
        },
        type: "function",
      })),
      ...(this.#options.maxOutputTokens !== undefined
        ? { max_tokens: this.#options.maxOutputTokens }
        : {}),
    };

    const timeoutSignal = AbortSignal.timeout(
      this.#options.requestTimeoutMs ?? 60_000,
    );
    let response: Response;
    try {
      response = await fetch(
        `${this.#options.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          body: JSON.stringify(body),
          headers: {
            Authorization: `Bearer ${this.#options.apiKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: AbortSignal.any([signal, timeoutSignal]),
        },
      );
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      if (timeoutSignal.aborted) {
        throw new ProviderStreamError(
          "request-timeout",
          "provider request exceeded its timeout",
        );
      }
      throw error;
    }
    if (!response.ok) {
      const parsed = parseErrorBody(await response.text());
      throw new ProviderHttpError({
        code: parsed.code,
        message: parsed.message,
        requestId: response.headers.get("x-request-id"),
        retryable:
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
        status: response.status,
      });
    }
    if (!response.body) {
      throw new ProviderStreamError(
        "missing-response-body",
        "provider response did not include a body",
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let finished = false;
    let usage: ProviderUsage | undefined;
    const toolCalls = new Map<number, ToolCallAccumulator>();
    const opaque: ProviderOpaqueArtifact[] = [];

    const consume = (block: string): void => {
      for (const line of block.split(/\r?\n/)) {
        if (!line.startsWith("data:")) {
          continue;
        }
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          finished = true;
          continue;
        }
        let payload: JsonObject;
        try {
          const parsed = JSON.parse(data) as unknown;
          if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("non-object SSE payload");
          }
          payload = parsed as JsonObject;
        } catch {
          throw new ProviderStreamError(
            "invalid-sse-json",
            `invalid SSE JSON: ${data.slice(0, 200)}`,
          );
        }

        const normalizedUsage = normalizeUsage(payload.usage);
        if (normalizedUsage) {
          usage = normalizedUsage;
          request.onStream?.({ type: "usage", usage: normalizedUsage });
        }
        const choices = payload.choices;
        if (!Array.isArray(choices) || choices.length === 0) {
          continue;
        }
        const choice = choices[0];
        if (choice === null || typeof choice !== "object" || Array.isArray(choice)) {
          throw new ProviderStreamError(
            "invalid-choice",
            "provider returned an invalid choice",
          );
        }
        const choiceObject = choice as JsonObject;
        const delta = choiceObject.delta;
        if (delta === null || typeof delta !== "object" || Array.isArray(delta)) {
          continue;
        }
        const deltaObject = delta as JsonObject;
        if (typeof deltaObject.content === "string") {
          text += deltaObject.content;
          request.onStream?.({
            type: "text_delta",
            text: deltaObject.content,
          });
        }
        if (typeof deltaObject.reasoning_content === "string") {
          const artifact = {
            payload: {
              text: deltaObject.reasoning_content,
              type: "reasoning_content",
            },
            provider: this.#options.providerName,
          };
          opaque.push(artifact);
          request.onStream?.({ type: "opaque", artifact });
        }
        if (Array.isArray(deltaObject.tool_calls)) {
          for (const callValue of deltaObject.tool_calls) {
            if (
              callValue === null ||
              typeof callValue !== "object" ||
              Array.isArray(callValue)
            ) {
              continue;
            }
            const call = callValue as JsonObject;
            const index = typeof call.index === "number" ? call.index : 0;
            const accumulator = toolCalls.get(index) ?? {
              arguments: "",
              id: "",
              name: "",
            };
            if (typeof call.id === "string") {
              accumulator.id += call.id;
            }
            if (call.function !== null && typeof call.function === "object" && !Array.isArray(call.function)) {
              const fn = call.function as JsonObject;
              if (typeof fn.name === "string") {
                accumulator.name += fn.name;
              }
              if (typeof fn.arguments === "string") {
                accumulator.arguments += fn.arguments;
              }
            }
            toolCalls.set(index, accumulator);
            request.onStream?.({
              type: "tool_call_delta",
              index,
              ...(typeof call.id === "string"
                ? { callId: call.id }
                : {}),
              ...(call.function !== null &&
              typeof call.function === "object" &&
              !Array.isArray(call.function) &&
              typeof (call.function as JsonObject).name === "string"
                ? { name: (call.function as JsonObject).name as string }
                : {}),
              ...(call.function !== null &&
              typeof call.function === "object" &&
              !Array.isArray(call.function) &&
              typeof (call.function as JsonObject).arguments === "string"
                ? {
                    argumentsDelta: (call.function as JsonObject)
                      .arguments as string,
                  }
                : {}),
            });
          }
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let boundary = findSseBoundary(buffer);
      while (boundary) {
        const block = buffer.slice(0, boundary.start);
        buffer = buffer.slice(boundary.end);
        consume(block);
        boundary = findSseBoundary(buffer);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      consume(buffer);
    }
    if (!finished) {
      throw new ProviderStreamError(
        "stream-incomplete",
        "provider stream ended before [DONE]",
      );
    }

    if (toolCalls.size === 0) {
      return {
        opaqueArtifacts: opaque,
        text,
        type: "final",
        ...(usage ? { usage } : {}),
      };
    }
    const calls: ProviderToolCall[] = [];
    for (const [index, call] of [...toolCalls.entries()].sort(
      ([left], [right]) => left - right,
    )) {
      if (!call.id || !call.name) {
        throw new ProviderStreamError(
          "invalid-tool-call",
          `tool call ${index} is missing id or name`,
        );
      }
      let input: JsonValue;
      try {
        input = JSON.parse(call.arguments) as JsonValue;
      } catch {
        throw new ProviderStreamError(
          "invalid-tool-arguments",
          `tool call ${call.id} returned invalid JSON arguments`,
        );
      }
      calls.push({ callId: call.id, input, name: call.name });
    }
    return {
      calls,
      opaqueArtifacts: opaque,
      text,
      type: "tool_calls",
      ...(usage ? { usage } : {}),
    };
  }
}

function findSseBoundary(
  buffer: string,
): { readonly end: number; readonly start: number } | null {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf < 0 && crlf < 0) {
    return null;
  }
  if (lf >= 0 && (crlf < 0 || lf <= crlf)) {
    return { end: lf + 2, start: lf };
  }
  return { end: crlf + 4, start: crlf };
}
