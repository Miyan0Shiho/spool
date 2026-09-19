import { isJsonValue, type JsonObject, type JsonValue } from "../contracts/json.js";

export function readObject(input: JsonValue): JsonObject | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  return input;
}

export function optionalBoolean(
  input: JsonObject,
  key: string,
): boolean | undefined {
  const value = input[key];
  return typeof value === "boolean" ? value : undefined;
}

export function optionalInteger(
  input: JsonObject,
  key: string,
): number | undefined {
  const value = input[key];
  return Number.isInteger(value) ? (value as number) : undefined;
}

export function optionalString(
  input: JsonObject,
  key: string,
): string | undefined {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

export function requireString(input: JsonObject, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

export function assertJsonValue(value: unknown): asserts value is JsonValue {
  if (!isJsonValue(value)) {
    throw new Error("value is not valid JSON");
  }
}
