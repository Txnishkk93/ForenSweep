import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { logInfo } from "./lib/logger.js";

const server = createServer(createApp());
server.listen(env.PORT, () =>
  logInfo("server_started", { port: env.PORT, environment: env.NODE_ENV }),
);

async function shutdown(signal: string): Promise<void> {
  logInfo("server_shutdown_started", { signal });
  server.close(async () => {
    await prisma.$disconnect();
    logInfo("server_shutdown_complete");
    process.exit(0);
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
