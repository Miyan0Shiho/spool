export class CommandConflictError extends Error {
  readonly commandId: string;

  constructor(commandId: string) {
    super(`command ${commandId} was already accepted with different content`);
    this.name = "CommandConflictError";
    this.commandId = commandId;
  }
}

export class RunStateError extends Error {
  readonly runId: string;

  constructor(runId: string, message: string) {
    super(message);
    this.name = "RunStateError";
    this.runId = runId;
  }
}
