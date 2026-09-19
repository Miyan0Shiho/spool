import type {
  InputReceipt,
  RunReceipt,
  RuntimeStore,
} from "../storage/store.js";

export class SessionController {
  readonly #store: RuntimeStore;

  constructor(store: RuntimeStore) {
    this.#store = store;
  }

  acceptInput(
    commandId: string,
    sessionId: string,
    input: string,
  ): InputReceipt {
    return this.#store.acceptInput(commandId, sessionId, input);
  }

  createRun(
    commandId: string,
    sessionId: string,
    runId: string,
    inputEventId: string,
  ): RunReceipt {
    return this.#store.createRun(
      commandId,
      sessionId,
      runId,
      inputEventId,
    );
  }
}
