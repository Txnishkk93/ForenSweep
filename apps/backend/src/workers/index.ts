import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { createRedisConnection } from "../lib/redis.js";
import { simulateJob } from "./simulation.js";
import { createRedisPublisher } from "../lib/publisher.js";
import {
  runEraseWithFallback,
  runRecoverWithFallback,
} from "./python-bridge.js";

const connection = createRedisConnection(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
const publisher = createRedisPublisher(env.REDIS_URL);
const eraseWorker = new Worker(
  "forensweep-erase",
  async (job) => runEraseWithFallback(job.data.jobId, publisher),
  { connection },
);
const recoverWorker = new Worker(
  "forensweep-recover",
  async (job) => runRecoverWithFallback(job.data.jobId, publisher),
  { connection },
);

console.info(
  JSON.stringify({ level: "info", message: "simulation_workers_started" }),
);

async function shutdown(): Promise<void> {
  await Promise.all([
    eraseWorker.close(),
    recoverWorker.close(),
    connection.quit(),
  ]);
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
