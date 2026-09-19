import type {
  ModelProvider,
  ProviderMetadata,
  ProviderRequest,
  ProviderResponse,
} from "./provider.js";

export type ScriptedProviderStep =
  | {
      readonly response: ProviderResponse;
      readonly type: "response";
    }
  | {
      readonly error: Error;
      readonly type: "error";
    }
  | {
      readonly text: string;
      readonly type: "hang";
    };

export class FakeProvider implements ModelProvider {
  readonly #steps: ScriptedProviderStep[];

  constructor(steps: readonly ScriptedProviderStep[]) {
    this.#steps = [...steps];
  }

  metadata(): ProviderMetadata {
    return {
      model: "fake",
      protocol: "deterministic",
      provider: "fake",
    };
  }

  async next(
    _request: ProviderRequest,
    signal: AbortSignal,
  ): Promise<ProviderResponse> {
    const step = this.#steps.shift();
    if (!step) {
      throw new Error("fake provider script is exhausted");
    }

    if (step.type === "error") {
      throw step.error;
    }
    if (step.type === "response") {
      return step.response;
    }

    return new Promise<ProviderResponse>((_resolve, reject) => {
      const abort = (): void => {
        reject(new DOMException("provider request aborted", "AbortError"));
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
    });
  }
}
