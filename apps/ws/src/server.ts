import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Redis } from "ioredis";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { prismaClient } from "@repo/db";
import { jobEventSchema } from "@repo/shared";

dotenv.config({
  path: fileURLToPath(new URL("../../backend/.env", import.meta.url)),
});

const port = Number(process.env.WS_PORT ?? 4001);
const redisUrl = process.env.REDIS_URL;
const jwtSecret = process.env.JWT_SECRET;
if (!redisUrl || !jwtSecret)
  throw new Error("REDIS_URL and JWT_SECRET are required for ws");

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN ?? "http://localhost:3000" },
});
const subscriber = new Redis(redisUrl, {
  retryStrategy: (times) => Math.min(times * 200, 5000),
  maxRetriesPerRequest: null,
});
subscriber.on("error", (error) => {
  console.error(JSON.stringify({
    level: "error",
    message: "Redis connection error",
    error: error.message,
  }));
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token as unknown;
  if (typeof token !== "string") {
    console.warn(JSON.stringify({ message: "ws_auth_rejected", socketId: socket.id, reason: "AUTH_TOKEN_MISSING" }));
    return next(new Error("AUTH_TOKEN_MISSING"));
  }
  try {
    socket.data.auth = jwt.verify(token, jwtSecret, {
      algorithms: ["HS256"],
      issuer: "forensweep-api",
      audience: "forensweep-web",
    });
    next();
  } catch {
    console.warn(JSON.stringify({ message: "ws_auth_rejected", socketId: socket.id, reason: "AUTH_TOKEN_INVALID" }));
    next(new Error("AUTH_TOKEN_INVALID"));
  }
});

io.on("connection", (socket) => {
  socket.on(
    "job:subscribe",
    async (
      jobId: unknown,
      acknowledge?: (result: { ok: boolean; error?: string }) => void,
    ) => {
      if (typeof jobId !== "string")
        return acknowledge?.({ ok: false, error: "INVALID_JOB_ID" });
      const auth = socket.data.auth as { sub: string; role: string };
      const job = await prismaClient.job.findUnique({
        where: { id: jobId },
        select: { userId: true },
      });
      if (!job || (job.userId !== auth.sub && auth.role !== "ADMIN")) {
        console.warn(JSON.stringify({ message: "ws_subscription_rejected", socketId: socket.id, jobId, userId: auth.sub, role: auth.role, reason: !job ? "JOB_NOT_FOUND" : "job.userId does not match requester" }));
        return acknowledge?.({ ok: false, error: "FORBIDDEN" });
      }
      await socket.join(`job:${jobId}`);
      acknowledge?.({ ok: true });
    },
  );
});

await subscriber.subscribe("forensweep:job-events");
subscriber.on("message", (_channel: string, message: string) => {
  let payload: unknown;
  try {
    payload = JSON.parse(message);
  } catch {
    return;
  }
  const parsed = jobEventSchema.safeParse(payload);
  if (!parsed.success) return;
  io.to(`job:${parsed.data.payload.jobId}`).emit(
    parsed.data.type,
    parsed.data.payload,
  );
});

httpServer.listen(port, () =>
  console.info(JSON.stringify({ message: "ws_started", port })),
);

async function shutdown(): Promise<void> {
  await subscriber.quit();
  await prismaClient.$disconnect();
  io.close();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
