import { strict as assert } from "node:assert";
import { test } from "node:test";
import { browseLocalFs, assertSafeLocalPath } from "./filesystem.service.js";

test("browseLocalFs lists roots without recursively loading them", async () => {
  const result = await browseLocalFs();
  assert.ok(result.entries.length >= 1);
  assert.equal(result.currentPath, null);
  assert.equal(result.parentPath, null);
});

test("browseLocalFs flags the system root while allowing it to be viewed", async () => {
  if (process.platform === "win32") return;
  const result = await browseLocalFs("/");
  assert.equal(result.currentPath, "/");
  assert.equal(result.entries.some((entry) => entry.isSystemProtected), true);
});

test("erase path validation rejects system roots", () => {
  assert.throws(() => assertSafeLocalPath(process.platform === "win32" ? "C:\\" : "/"), /SYSTEM_PATH_PROTECTED|System-critical/);
});
