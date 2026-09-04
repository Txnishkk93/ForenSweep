import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canonicalJson, sha256 } from "./index.js";

test("canonical JSON sorts object keys and stringifies BigInt values", () => {
  assert.equal(
    canonicalJson({ z: 1, nested: { b: 2, a: 1 }, a: 3n }),
    '{"a":"3","nested":{"a":1,"b":2},"z":1}',
  );
});

test("logical payload order does not change the SHA-256 hash", () => {
  assert.equal(sha256({ a: 1, b: 2 }), sha256({ b: 2, a: 1 }));
});
