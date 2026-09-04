import { spawn } from "node:child_process";
import { simulateJob } from "./simulation.js";
import type { EventPublisher } from "../lib/publisher.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function runEraseWithPython(jobId: string): Promise<void> {
  if (!uuidPattern.test(jobId)) throw new Error("Invalid internal job ID");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "python",
      ["-m", "forensweep_worker.main", "erase", "--job-id", jobId],
      {
        shell: false,
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`Python worker exited with code ${code ?? "unknown"}`),
          ),
    );
  });
}

export async function runEraseWithFallback(
  jobId: string,
  publisher?: EventPublisher,
): Promise<void> {
  try {
    await runEraseWithPython(jobId);
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      await simulateJob(jobId, "ERASE", undefined, publisher);
      return;
    }
    throw error;
  }
}

export async function runRecoverWithPython(jobId: string): Promise<void> {
  if (!uuidPattern.test(jobId)) throw new Error("Invalid internal job ID");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "python",
      ["-m", "forensweep_worker.main", "recover", "--job-id", jobId],
      { shell: false, stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`Python worker exited with code ${code ?? "unknown"}`),
          ),
    );
  });
}

export async function runRecoverWithFallback(
  jobId: string,
  publisher?: EventPublisher,
): Promise<void> {
  try {
    await runRecoverWithPython(jobId);
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT"))
      await simulateJob(jobId, "RECOVER", undefined, publisher);
    else throw error;
  }
}
