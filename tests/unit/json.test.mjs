import assert from "node:assert/strict";
import { test } from "node:test";

import { isJsonValue } from "../../dist/contracts/json.js";

test("isJsonValue accepts only acyclic strict JSON values", () => {
  const circular = {};
  circular.self = circular;
  const sparse = [];
  sparse.length = 1;
  const symbolKeyed = { value: 1, [Symbol("hidden")]: 2 };
  const hiddenProperty = Object.defineProperty({}, "hidden", {
    enumerable: false,
    value: 1,
  });
  const withToJson = {
    toJSON() {
      return "different";
    },
    value: 1,
  };

  assert.equal(
    isJsonValue({
      array: [null, true, 1, "value"],
      nested: { ok: true },
    }),
    true,
  );
  assert.equal(isJsonValue(new Date()), false);
  assert.equal(isJsonValue(new Map()), false);
  assert.equal(isJsonValue(new Set()), false);
  assert.equal(isJsonValue(sparse), false);
  assert.equal(isJsonValue(circular), false);
  assert.equal(isJsonValue(symbolKeyed), false);
  assert.equal(isJsonValue(hiddenProperty), false);
  assert.equal(isJsonValue(withToJson), false);
  assert.equal(isJsonValue(Number.NaN), false);
  assert.equal(isJsonValue(1n), false);
});
