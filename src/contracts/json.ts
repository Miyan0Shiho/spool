export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export function isJsonValue(value: unknown): value is JsonValue {
  return isJsonValueInternal(value, new Set<object>());
}

function isJsonValueInternal(
  value: unknown,
  ancestors: Set<object>,
): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "object") {
    return false;
  }
  if (ancestors.has(value)) {
    return false;
  }

  ancestors.add(value);
  let valid = false;
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    const ownKeys = Reflect.ownKeys(value);
    valid =
      !("toJSON" in value) &&
      ownKeys.length === value.length + 1 &&
      ownKeys.every((key) => typeof key === "string") &&
      keys.length === value.length &&
      keys.every(
        (key) =>
          Object.hasOwn(value, key) &&
          isJsonValueInternal(value[Number(key)], ancestors),
      );
  } else {
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype === Object.prototype || prototype === null) {
      try {
        const ownKeys = Reflect.ownKeys(value);
        valid =
          !("toJSON" in value) &&
          ownKeys.every((key) => typeof key === "string") &&
          ownKeys.length === Object.keys(value).length &&
          Object.values(value).every((entry) =>
            isJsonValueInternal(entry, ancestors),
          );
      } catch {
        valid = false;
      }
    }
  }
  ancestors.delete(value);
  return valid;
}
