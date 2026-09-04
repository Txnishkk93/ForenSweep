import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const eraseQueue = new Queue("forensweep-erase", { connection });
export const recoverQueue = new Queue("forensweep-recover", { connection });

export type JobQueue = {
  addErase: (jobId: string) => Promise<void>;
  addRecover: (jobId: string) => Promise<void>;
};

export const jobQueue: JobQueue = {
  addErase: async (jobId) => {
    await eraseQueue.add(
      "erase",
      { jobId },
      { removeOnComplete: 100, removeOnFail: 100 },
    );
  },
  addRecover: async (jobId) => {
    await recoverQueue.add(
      "recover",
      { jobId },
      { removeOnComplete: 100, removeOnFail: 100 },
    );
  },
};

export async function closeQueues(): Promise<void> {
  await Promise.all([
    eraseQueue.close(),
    recoverQueue.close(),
    connection.quit(),
  ]);
}
