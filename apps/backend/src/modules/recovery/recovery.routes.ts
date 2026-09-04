import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireWorkerToken } from "../../middleware/worker-auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { sendSuccess } from "../../lib/serialize.js";
import {
  exportRecoveredFile,
  getRecoveredArtifact,
  ingestRecoveredFile,
  listRecoveredFiles,
} from "./recovery.service.js";
import { env } from "../../config/env.js";
import { recoveredFileSchema } from "./recovery.schemas.js";
import type { $Enums } from "@prisma/client";

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
        {
          fileType:
            typeof req.query.fileType === "string"
              ? req.query.fileType
              : undefined,
          confidenceLevel:
            typeof req.query.confidenceLevel === "string"
              ? (req.query.confidenceLevel as $Enums.ConfidenceLevel)
              : undefined,
          truncated:
            req.query.truncated === "true"
              ? true
              : req.query.truncated === "false"
                ? false
                : undefined,
          fragmented:
            req.query.fragmented === "true"
              ? true
              : req.query.fragmented === "false"
                ? false
                : undefined,
        },
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
    const artifact = await getRecoveredArtifact(
      String(req.params.fileId),
      req.auth!.userId,
      req.auth!.role === "ADMIN",
      env.SAFE_OUTPUT_ROOT,
    );
    res.type(artifact.mimeType).download(artifact.path, artifact.fileName);
  }),
);
recoveryRoutes.post(
  "/recovered-files/:id/export",
  validateParams(idSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await exportRecoveredFile(
        String(req.params.id),
        req.auth!.userId,
        req.auth!.role === "ADMIN",
        env.SAFE_OUTPUT_ROOT,
      ),
      201,
      { requestId: req.requestId },
    ),
  ),
);
