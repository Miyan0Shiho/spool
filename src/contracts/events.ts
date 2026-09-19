import type { JsonValue } from "./json.js";

export type EventType =
  | "artifact/stored"
  | "assistant/message"
  | "context/compacted"
  | "input/received"
  | "permission/decided"
  | "permission/requested"
  | "provider/error"
  | "provider/request"
  | "run/cancelled"
  | "run/claimed"
  | "run/completed"
  | "run/created"
  | "run/failed"
  | "tool/intent"
  | "tool/result";

export interface EventDraft {
  readonly eventId: string;
  readonly sessionId: string;
  readonly runId: string | null;
  readonly type: EventType;
  readonly payload: JsonValue;
  readonly createdAt: string;
}

export interface PersistedEvent extends EventDraft {
  readonly seq: number;
}
