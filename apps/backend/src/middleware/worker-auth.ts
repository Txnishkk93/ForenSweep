import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { AppError } from "./error-handler.js";

export const requireWorkerToken: RequestHandler = (req, _res, next) => {
  const provided = req.header("x-worker-token");
  if (!provided) {
    next(
      new AppError(401, "WORKER_TOKEN_INVALID", "Worker authentication failed"),
    );
    return;
  }
  const expected = Buffer.from(env.INTERNAL_WORKER_TOKEN);
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    next(
      new AppError(401, "WORKER_TOKEN_INVALID", "Worker authentication failed"),
    );
    return;
  }
  next();
};
