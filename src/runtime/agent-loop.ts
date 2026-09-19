import { randomUUID } from "node:crypto";

import { compactProviderMessages } from "../context/compaction.js";
import type { ModelProvider } from "../providers/provider.js";
import { isProviderResponse } from "../providers/provider.js";
import type {
  ProviderMessage,
  ProviderStreamEvent,
} from "../providers/provider.js";
import type { PermissionBroker } from "../permissions/permission-manager.js";
import type { RuntimeStore } from "../storage/store.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { ToolInvocationContext } from "../tools/tool-registry.js";

export interface AgentRunRequest {
  readonly input: string;
  readonly maxProviderMessages?: number;
  readonly provider: ModelProvider;
  readonly permissions?: PermissionBroker;
  readonly runId: string;
  readonly sessionId: string;
  readonly signal: AbortSignal;
  readonly tools: ToolRegistry;
  readonly toolContext?: Omit<ToolInvocationContext, "signal">;
  readonly onStream?: (event: AgentStreamEvent) => void;
}

export type AgentStreamEvent =
  | ProviderStreamEvent
  | {
      readonly callId: string;
      readonly status: "aborted" | "error" | "ok" | "unknown";
      readonly toolName: string;
      readonly type: "tool_finished";
    }
  | {
      readonly callId: string;
      readonly reason: string;
      readonly toolName: string;
      readonly type: "tool_denied";
    }
  | {
      readonly callId: string;
      readonly toolName: string;
      readonly type: "tool_started";
    };

export type AgentRunOutcome =
  | {
      readonly status: "cancelled" | "completed";
      readonly text: string;
    }
  | {
      readonly error: string;
      readonly status: "failed";
    };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const maxSteps = 32;

export class AgentLoop {
  readonly #store: RuntimeStore;

  constructor(store: RuntimeStore) {
    this.#store = store;
  }

  async run(request: AgentRunRequest): Promise<AgentRunOutcome> {
    if (!this.#store.claimRun(request.runId, request.sessionId)) {
      throw new Error(`run ${request.runId} could not be claimed`);
    }

    let step = 0;
    const seenCallIds = new Set<string>();
    const messages: ProviderMessage[] = [
      { content: request.input, role: "user" },
    ];
    try {
      while (true) {
        const compaction = compactProviderMessages(
          messages,
          request.maxProviderMessages ?? 64,
        );
        if (compaction.compacted) {
          messages.splice(0, messages.length, ...compaction.messages);
          this.#store.appendEvent({
            createdAt: new Date().toISOString(),
            eventId: randomUUID(),
            payload: {
              droppedMessages: compaction.droppedMessages,
              summary: compaction.summary,
            },
            runId: request.runId,
            sessionId: request.sessionId,
            type: "context/compacted",
          });
        }

        if (step >= maxSteps) {
          const message = `agent loop exceeded ${maxSteps} steps`;
          this.#store.appendEvent({
            createdAt: new Date().toISOString(),
            eventId: randomUUID(),
            payload: { message },
            runId: request.runId,
            sessionId: request.sessionId,
            type: "provider/error",
          });
          this.#store.finishRun(request.runId, "failed", message);
          return { error: message, status: "failed" };
        }
        if (request.signal.aborted) {
          this.#store.finishRun(request.runId, "cancelled", "cancelled");
          return { status: "cancelled", text: "" };
        }

        this.#store.appendEvent({
          createdAt: new Date().toISOString(),
          eventId: randomUUID(),
          payload: {
            input: request.input,
            provider: {
              model: request.provider.metadata().model,
              protocol: request.provider.metadata().protocol,
              provider: request.provider.metadata().provider,
            },
            step,
          },
          runId: request.runId,
          sessionId: request.sessionId,
          type: "provider/request",
        });

        let rawResponse: unknown;
        try {
          rawResponse = await request.provider.next(
            {
              input: request.input,
              messages,
              runId: request.runId,
              sessionId: request.sessionId,
              step,
              tools: request.tools.descriptors(),
              ...(request.onStream
                ? { onStream: request.onStream }
                : {}),
            },
            request.signal,
          );
        } catch (error) {
          if (request.signal.aborted) {
            this.#store.finishRun(request.runId, "cancelled", "cancelled");
            return { status: "cancelled", text: "" };
          }
          const message = errorMessage(error);
          this.#store.appendEvent({
            createdAt: new Date().toISOString(),
            eventId: randomUUID(),
            payload: { message },
            runId: request.runId,
            sessionId: request.sessionId,
            type: "provider/error",
          });
          this.#store.finishRun(request.runId, "failed", message);
          return { error: message, status: "failed" };
        }

        if (!isProviderResponse(rawResponse)) {
          const message = "provider returned a malformed response";
          this.#store.appendEvent({
            createdAt: new Date().toISOString(),
            eventId: randomUUID(),
            payload: { message },
            runId: request.runId,
            sessionId: request.sessionId,
            type: "provider/error",
          });
          this.#store.finishRun(request.runId, "failed", message);
          return { error: message, status: "failed" };
        }
        const response = rawResponse;

        if (request.signal.aborted) {
          this.#store.finishRun(request.runId, "cancelled", "cancelled");
          return { status: "cancelled", text: "" };
        }

        if (response.type === "final") {
          this.#store.appendEvent({
            createdAt: new Date().toISOString(),
            eventId: randomUUID(),
            payload: {
              opaqueArtifacts: (response.opaqueArtifacts ?? []).map(
                (artifact) => ({
                  payload: artifact.payload,
                  provider: artifact.provider,
                }),
              ),
              text: response.text,
              usage: response.usage
                ? {
                    inputTokens: response.usage.inputTokens,
                    outputTokens: response.usage.outputTokens,
                  }
                : null,
            },
            runId: request.runId,
            sessionId: request.sessionId,
            type: "assistant/message",
          });
          messages.push({
            content: response.text,
            opaqueArtifacts: response.opaqueArtifacts ?? [],
            role: "assistant",
            toolCalls: [],
          });
          this.#store.finishRun(request.runId, "completed", "model-final");
          return { status: "completed", text: response.text };
        }

        const callIds = new Set<string>();
        const invalidCall = response.calls.some((call) => {
          if (
            call.callId.length === 0 ||
            call.name.length === 0 ||
            callIds.has(call.callId) ||
            seenCallIds.has(call.callId)
          ) {
            return true;
          }
          callIds.add(call.callId);
          return false;
        });
        if (response.calls.length === 0 || invalidCall) {
          const message =
            response.calls.length === 0
              ? "provider returned an empty tool call batch"
              : "provider returned invalid or duplicate tool calls";
          this.#store.appendEvent({
            createdAt: new Date().toISOString(),
            eventId: randomUUID(),
            payload: { message },
            runId: request.runId,
            sessionId: request.sessionId,
            type: "provider/error",
          });
          this.#store.finishRun(request.runId, "failed", message);
          return { error: message, status: "failed" };
        }
        for (const call of response.calls) {
          seenCallIds.add(call.callId);
        }

        this.#store.appendEvent({
          createdAt: new Date().toISOString(),
          eventId: randomUUID(),
          payload: {
            calls: response.calls.map((call) => ({
              callId: call.callId,
              input: call.input,
              name: call.name,
            })),
            text: response.text,
            opaqueArtifacts: (response.opaqueArtifacts ?? []).map(
              (artifact) => ({
                payload: artifact.payload,
                provider: artifact.provider,
              }),
            ),
            usage: response.usage
              ? {
                  inputTokens: response.usage.inputTokens,
                  outputTokens: response.usage.outputTokens,
                }
              : null,
          },
          runId: request.runId,
          sessionId: request.sessionId,
          type: "assistant/message",
        });
        messages.push({
          content: response.text,
          opaqueArtifacts: response.opaqueArtifacts ?? [],
          role: "assistant",
          toolCalls: response.calls,
        });

        for (let index = 0; index < response.calls.length; index += 1) {
          const call = response.calls[index];
          if (!call) {
            continue;
          }
          if (request.signal.aborted) {
            this.#store.recordToolResult(
              request.sessionId,
              request.runId,
              call.callId,
              "aborted",
              { dispatched: false, reason: "aborted-before-dispatch" },
            );
            request.onStream?.({
              type: "tool_finished",
              callId: call.callId,
              status: "aborted",
              toolName: call.name,
            });
            messages.push({
              content: {
                dispatched: false,
                reason: "aborted-before-dispatch",
              },
              role: "tool",
              toolCallId: call.callId,
            });
            continue;
          }

          const tool = request.tools.get(call.name);
          if (!tool) {
            this.#store.recordToolResult(
              request.sessionId,
              request.runId,
              call.callId,
              "error",
              {
                code: "unknown-tool",
                message: `unknown tool ${call.name}`,
              },
            );
            messages.push({
              content: {
                code: "unknown-tool",
                message: `unknown tool ${call.name}`,
              },
              role: "tool",
              toolCallId: call.callId,
            });
            continue;
          }

          this.#store.appendEvent({
            createdAt: new Date().toISOString(),
            eventId: randomUUID(),
            payload: {
              callId: call.callId,
              effect: tool.effect,
              input: call.input,
              toolName: call.name,
            },
            runId: request.runId,
            sessionId: request.sessionId,
            type: "permission/requested",
          });
          const permission = request.permissions
            ? await request.permissions.authorize(
                {
                  callId: call.callId,
                  input: call.input,
                  tool,
                },
                request.signal,
              )
            : {
                action: "allow" as const,
                reason: "permission broker omitted",
                source: "policy" as const,
              };
          this.#store.appendEvent({
            createdAt: new Date().toISOString(),
            eventId: randomUUID(),
            payload: {
              action: permission.action,
              callId: call.callId,
              reason: permission.reason,
              source: permission.source,
            },
            runId: request.runId,
            sessionId: request.sessionId,
            type: "permission/decided",
          });
          if (permission.action === "deny") {
            this.#store.recordToolResult(
              request.sessionId,
              request.runId,
              call.callId,
              "error",
              {
                code: "permission-denied",
                message: permission.reason,
              },
            );
            request.onStream?.({
              type: "tool_denied",
              callId: call.callId,
              reason: permission.reason,
              toolName: call.name,
            });
            messages.push({
              content: {
                code: "permission-denied",
                message: permission.reason,
              },
              role: "tool",
              toolCallId: call.callId,
            });
            continue;
          }

          this.#store.recordToolIntent(
            request.sessionId,
            request.runId,
            call.callId,
            call.name,
            call.input,
          );
          request.onStream?.({
            type: "tool_started",
            callId: call.callId,
            toolName: call.name,
          });
          let result;
          try {
            result = await request.tools.invoke(
              call.name,
              call.input,
              {
                ...request.toolContext,
                signal: request.signal,
              },
            );
          } catch (error) {
            this.#store.recordToolResult(
              request.sessionId,
              request.runId,
              call.callId,
              "unknown",
              {
                dispatched: true,
                message: errorMessage(error),
              },
            );
            request.onStream?.({
              type: "tool_finished",
              callId: call.callId,
              status: "unknown",
              toolName: call.name,
            });
            for (const remaining of response.calls.slice(index + 1)) {
              this.#store.recordToolResult(
                request.sessionId,
                request.runId,
                remaining.callId,
                "aborted",
                {
                  dispatched: false,
                  reason: "run-failed-after-unknown-tool-outcome",
                },
              );
            }
            messages.push({
              content: {
                dispatched: true,
                message: errorMessage(error),
              },
              role: "tool",
              toolCallId: call.callId,
            });
            const message = `tool ${call.name} outcome is unknown`;
            if (request.signal.aborted) {
              this.#store.finishRun(
                request.runId,
                "cancelled",
                "cancelled-with-unknown-tool-outcome",
              );
              return { status: "cancelled", text: "" };
            }
            this.#store.finishRun(request.runId, "failed", message);
            return { error: message, status: "failed" };
          }
          this.#store.recordToolResult(
            request.sessionId,
            request.runId,
            call.callId,
            result.status,
            result.output,
          );
          request.onStream?.({
            type: "tool_finished",
            callId: call.callId,
            status: result.status,
            toolName: call.name,
          });
          messages.push({
            content: result.output,
            role: "tool",
            toolCallId: call.callId,
          });
          if (result.status === "unknown") {
            const message = `tool ${call.name} reported an unknown outcome`;
            for (const remaining of response.calls.slice(index + 1)) {
              this.#store.recordToolResult(
                request.sessionId,
                request.runId,
                remaining.callId,
                "aborted",
                {
                  dispatched: false,
                  reason: "run-failed-after-unknown-tool-outcome",
                },
              );
            }
            if (request.signal.aborted) {
              this.#store.finishRun(
                request.runId,
                "cancelled",
                "cancelled-with-unknown-tool-outcome",
              );
              return { status: "cancelled", text: "" };
            }
            this.#store.finishRun(request.runId, "failed", message);
            return { error: message, status: "failed" };
          }
        }

        step += 1;
      }
    } catch (error) {
      const message = errorMessage(error);
      try {
        this.#store.finishRun(request.runId, "failed", message);
      } catch {
        // The original storage or tool failure remains authoritative.
      }
      throw error;
    }
  }
}
