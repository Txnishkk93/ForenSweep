import { strict as assert } from "node:assert";
import { test } from "node:test";

test("ZIP signatures and raw image validation reject obvious disguises", async () => {
  const { generatedUploadFilename, hasZipSignature, isRawBinary } = await import("./acquisition.routes.js");
  assert.equal(hasZipSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04])), true);
  assert.equal(hasZipSignature(Buffer.from("not a zip")), false);
  assert.equal(isRawBinary(Buffer.from([0, 1, 2, 255])), true);
  assert.equal(isRawBinary(Buffer.from("plain text pretending to be an image")), false);
  assert.match(generatedUploadFilename("../../etc/passwd.img"), /^[0-9a-f-]{36}\.upload\.img$/);
});