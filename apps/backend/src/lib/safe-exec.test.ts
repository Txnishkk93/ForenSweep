import { strict as assert } from "node:assert";
import { test } from "node:test";
import { safeReadCommand } from "./safe-exec.js";

test("kills a non-terminating PowerShell command at the timeout", async (context) => {
  if (process.platform !== "win32") {
    context.skip("PowerShell timeout regression is Windows-specific");
    return;
  }
  await assert.rejects(
    safeReadCommand(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "Start-Sleep -Seconds 2"],
      50,
    ),
    /powershell\.exe timed out after 50ms/,
  );
});
