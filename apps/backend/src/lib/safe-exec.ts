import { spawn } from "node:child_process";

export const ALLOWED_COMMANDS = new Set([
  "lsblk",
  "smartctl",
  "nvme",
  "findmnt",
  "diskutil",
  "powershell.exe",
]);

export function safeReadCommand(
  command: string,
  args: string[],
  timeoutMs = 5000,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  if (!ALLOWED_COMMANDS.has(command))
    return Promise.reject(new Error(`Command is not allowlisted: ${command}`));
  if (args.some((arg) => arg.includes("\0")))
    return Promise.reject(new Error("Command argument contains a NUL byte"));

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error(`${command} timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once("error", (error) => {
      clearTimeout(timer);
      if (!settled) { settled = true; reject(error); }
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (!settled) { settled = true; resolve({ stdout, stderr, code }); }
    });
  });
}