import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler } from "express";
import { logError } from "../lib/logger.js";
import { sendSuccess } from "../lib/serialize.js";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
    public isOperational = true,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const requestId = req.requestId;
  let appError = error instanceof AppError ? error : undefined;
  if (error instanceof Prisma.PrismaClientKnownRequestError)
    appError = new AppError(
      error.code === "P2025" ? 404 : 409,
      error.code,
      "Database operation could not be completed",
    );
  if (!appError)
    appError = new AppError(
      500,
      "INTERNAL_SERVER_ERROR",
      "An unexpected error occurred",
      undefined,
      false,
    );
  logError(appError.message, {
    requestId,
    code: appError.code,
    statusCode: appError.statusCode,
    method: req.method,
    path: req.path,
    userId: req.auth?.userId ?? "unauthenticated",
    role: req.auth?.role ?? "unauthenticated",
    ...(appError.statusCode === 403
      ? { authorizationCheck: (appError.details as { authorizationCheck?: string } | undefined)?.authorizationCheck ?? "authorization check did not provide a reason" }
      : {}),
  });
  const details = appError.statusCode < 500 ? appError.details : undefined;
  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(details === undefined ? {} : { details }),
    },
    meta: { requestId },
  });
};
