import cors from "cors";
import express, { type Express } from "express";
import { env } from "./config/env.js";
import { logInfo } from "./lib/logger.js";
import { authRoutes, createAuthRoutes } from "./modules/auth/auth.routes.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { requestId } from "./middleware/request-id.js";
import type { UserStore } from "./modules/auth/auth.service.js";
import {
  createDeviceRoutes,
  createErasePreviewRoutes,
  deviceRoutes,
  erasePreviewRoutes,
} from "./modules/devices/device.routes.js";
import type { DeviceStore } from "./modules/devices/device.service.js";
import { jobRoutes, createJobRoutes } from "./modules/jobs/job.routes.js";
import type { JobStore } from "./modules/jobs/job.service.js";

export function createApp(
  options: {
    userStore?: UserStore;
    deviceStore?: DeviceStore;
    jobStore?: JobStore;
  } = {},
): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestId);
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/api/devices",
    options.deviceStore
      ? createDeviceRoutes(options.deviceStore)
      : deviceRoutes,
  );
  app.use(
    "/api/jobs",
    options.deviceStore
      ? createErasePreviewRoutes(options.deviceStore)
      : erasePreviewRoutes,
  );
  app.use(
    "/api/jobs",
    options.jobStore ? createJobRoutes(options.jobStore) : jobRoutes,
  );
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () =>
      logInfo("request", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        requestId: req.requestId,
      }),
    );
    next();
  });
  app.get("/health", (req, res) =>
    res.json({
      success: true,
      data: {
        service: "forensweep-backend",
        status: "ok",
        timestamp: new Date().toISOString(),
        environment: env.NODE_ENV,
      },
      meta: { requestId: req.requestId },
    }),
  );
  app.use(
    "/api/auth",
    options.userStore ? createAuthRoutes(options.userStore) : authRoutes,
  );
  app.use("/api/admin", adminRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
