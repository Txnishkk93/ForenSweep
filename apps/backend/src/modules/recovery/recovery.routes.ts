import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireWorkerToken } from "../../middleware/worker-auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { sendSuccess } from "../../lib/serialize.js";
import { ingestRecoveredFile, listRecoveredFiles } from "./recovery.service.js";
import { recoveredFileSchema } from "./recovery.schemas.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

const jobIdSchema = z.object({ jobId: z.uuid() });
const idSchema = z.object({ id: z.uuid() });
export const internalRecoveryRoutes: RouterType = Router();
internalRecoveryRoutes.use(requireWorkerToken);
internalRecoveryRoutes.post(
  "/jobs/:jobId/recovered-files",
  validateParams(jobIdSchema),
  validateBody(recoveredFileSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await ingestRecoveredFile(String(req.params.jobId), req.body),
      201,
    ),
  ),
);

export const recoveryRoutes: RouterType = Router();
recoveryRoutes.use(requireAuth);
recoveryRoutes.get(
  "/jobs/:id/recovered-files",
  validateParams(idSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await listRecoveredFiles(
        String(req.params.id),
        req.auth!.userId,
        req.auth!.role === "ADMIN",
      ),
      200,
      { requestId: req.requestId },
    ),
  ),
);
recoveryRoutes.get(
  "/jobs/:id/recovered-files/:fileId/download",
  validateParams(z.object({ id: z.uuid(), fileId: z.uuid() })),
  asyncHandler(async (req, res) => {
    const job = await prisma.job.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!job || (job.userId !== req.auth!.userId && req.auth!.role !== "ADMIN"))
      throw new AppError(
        403,
        "FORBIDDEN",
        "You do not have permission to access this file",
      );
    res
      .status(501)
      .json({
        success: false,
        error: {
          code: "DOWNLOAD_NOT_IMPLEMENTED",
          message: "Safe download serving is not implemented yet",
        },
        meta: { requestId: req.requestId },
      });
  }),
);
