import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { FakeProvider } from "./fake-provider.js";
import type { ModelProvider } from "./provider.js";

export interface ProviderFactoryOptions {
  readonly apiKeyEnv?: string;
  readonly baseUrl?: string;
  readonly fakeResponse?: string;
  readonly model?: string;
  readonly provider:
    | "deepseek"
    | "fake"
    | "fake-stream"
    | "fake-write"
    | "openai-compatible";
  readonly systemPrompt?: string;
}

export function createProvider(options: ProviderFactoryOptions): ModelProvider {
  if (options.provider === "fake") {
    const response = options.fakeResponse ?? "fake provider response";
    return {
      metadata() {
        return {
          model: options.model ?? "fake",
          protocol: "deterministic",
          provider: "fake",
        };
      },
      async next() {
        return { text: response, type: "final" };
      },
    };
  }

  if (options.provider === "fake-write") {
    return new FakeProvider([
      {
        response: {
          calls: [
            {
              callId: "fake-write-call",
              input: {
                content: "approved write\n",
                path: "approved.txt",
              },
              name: "write_file",
            },
          ],
          text: "write approved.txt",
          type: "tool_calls",
        },
        type: "response",
      },
      {
        response: {
          text: "file written",
          type: "final",
        },
        type: "response",
      },
    ]);
  }

  if (options.provider === "fake-stream") {
    let step = 0;
    return {
      metadata() {
        return {
          model: "fake-stream",
          protocol: "deterministic-stream",
          provider: "fake",
        };
      },
      async next(request) {
        if (step === 0) {
          step += 1;
          request.onStream?.({ type: "text_delta", text: "planning\n" });
          await new Promise((resolve) => setTimeout(resolve, 20));
          return {
            calls: [
              {
                callId: "stream-write-call",
                input: {
                  content: "stream approved\n",
                  path: "streamed.txt",
                },
                name: "write_file",
              },
            ],
            text: "planning\n",
            type: "tool_calls",
          };
        }
        request.onStream?.({ type: "text_delta", text: "stream complete\n" });
        return {
          text: "stream complete\n",
          type: "final",
        };
      },
    };
  }

  const defaults =
    options.provider === "deepseek"
      ? {
          apiKeyEnv: "DEEPSEEK_API_KEY",
          baseUrl: "https://api.deepseek.com/v1",
          model: "deepseek-flash",
        }
      : {
          apiKeyEnv: "OPENAI_API_KEY",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4.1-mini",
        };
  const apiKeyEnv = options.apiKeyEnv ?? defaults.apiKeyEnv;
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) {
    throw new Error(`missing provider credential environment variable ${apiKeyEnv}`);
  }
  return new OpenAICompatibleProvider({
    apiKey,
    baseUrl: options.baseUrl ?? defaults.baseUrl,
    model: options.model ?? defaults.model,
    providerName: options.provider,
    ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
  });
}
