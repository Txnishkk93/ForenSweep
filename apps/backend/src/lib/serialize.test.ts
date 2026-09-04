import { strict as assert } from "node:assert";
import { test } from "node:test";
import { serialize } from "./serialize.js";

test("serialize converts nested BigInt values to strings", () => {
  assert.deepEqual(
    serialize({ sizeBytes: 1000n, nested: [1n, { offset: 42n }], empty: null }),
    {
      sizeBytes: "1000",
      nested: ["1", { offset: "42" }],
      empty: null,
    },
  );
});
