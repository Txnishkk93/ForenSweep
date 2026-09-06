import type { Prisma, $Enums } from "@prisma/client";
import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { requireWorkerToken } from "../../middleware/worker-auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import {
  internalAuditSchema,
  internalCompleteSchema,
  internalFailSchema,
  internalJobParamsSchema,
  internalProgressSchema,
} from "./internal.schemas.js";
import { deviceSyncSchema } from "./device-sync.schemas.js";
import { appendAuditEvent } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { serialize } from "../../lib/serialize.js";
import {
  createLocalPublisher,
  type EventPublisher,
} from "../../lib/publisher.js";

export function createInternalRoutes(
  publisher: EventPublisher = createLocalPublisher(() => undefined),
): RouterType {
  const routes = Router();
  routes.use(requireWorkerToken);

  routes.post(
    "/devices/sync",
    validateBody(deviceSyncSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof deviceSyncSchema>;
      const syncedAt = new Date();
      for (const device of body.devices) {
        const existing = await prisma.device.findFirst({
          where: { path: device.path },
          select: { id: true },
        });
        const deviceType: $Enums.DeviceType = device.transport === "nvme"
          ? "SSD"
          : device.transport === "usb"
            ? "USB"
            : device.transport === "mmc"
              ? "SD_CARD"
              : device.rotational === true
                ? "HDD"
                : "SSD";
        const data: Prisma.DeviceUncheckedCreateInput = {
            path: device.path,
            model: device.model,
            serial: device.serial,
            sizeBytes: device.size === null ? null : BigInt(device.size),
            type: deviceType,
            supportsAta: device.supports_ata,
            supportsNvme: device.supports_nvme,
            supportsSed: device.supports_sed,
            mounted: device.mounted,
            isSystemDisk: device.system_disk,
            capabilitySnapshot: device.capability_evidence as Prisma.InputJsonObject,
            lastSeenAt: syncedAt,
          };
        if (existing) {
          await prisma.device.update({ where: { id: existing.id }, data });
        } else {
          await prisma.device.create({ data });
        }
      }
      res.json({
        success: true,
        data: { deviceCount: body.devices.length, syncedAt: syncedAt.toISOString() },
      });
    }),
  );

  routes.get(
    "/jobs/:jobId/worker-context",
    validateParams(internalJobParamsSchema),
    asyncHandler(async (req, res) => {
      const job = await prisma.job.findUnique({
        where: { id: String(req.params.jobId) },
      });
      if (!job) throw new AppError(404, "JOB_NOT_FOUND", "Job not found");
      res.json({
        success: true,
        data: {
          job: {
            id: job.id,
            type: job.type,
            status: job.status,
            stage: job.stage,
            eraseMethod: job.eraseMethod,
            eraseScope: job.eraseScope,
            standard: job.standard,
            userId: job.userId,
            approvedById: job.approvedById,
            startedAt: job.startedAt?.toISOString() ?? null,
            totalPasses: job.totalPasses,
            sourceImagePath: job.sourceImagePath,
          },
          device: serialize(
            job.deviceId
              ? await prisma.device.findUnique({ where: { id: job.deviceId } })
              : null,
          ),
        },
      });
    }),
  );

  routes.post(
    "/jobs/:jobId/progress",
    validateParams(internalJobParamsSchema),
    validateBody(internalProgressSchema),
    asyncHandler(async (req, res) => {
      const job = await prisma.job.findUnique({
        where: { id: String(req.params.jobId) },
      });
      if (!job) throw new AppError(404, "JOB_NOT_FOUND", "Job not found");
      const body = req.body as z.infer<typeof internalProgressSchema>;
      const status = body.stage === "VERIFYING" ? "VERIFYING" : "RUNNING";
      const updated = await prisma.job.update({
        where: { id: job.id },
        data: {
          status,
          stage: body.stage,
          progress: body.progress,
          currentPass: body.currentPass ?? job.currentPass,
          totalPasses: body.totalPasses ?? job.totalPasses,
          progressDetail: body.progressDetail as Prisma.InputJsonObject,
        },
      });
      res.json({
        success: true,
        data: {
          id: updated.id,
          status: updated.status,
          stage: updated.stage,
          progress: updated.progress,
        },
      });
      await publisher.publish({
        type: "job:progress",
        payload: {
          jobId: updated.id,
          stage: updated.stage,
          progress: updated.progress,
          message: "Worker progress persisted",
        },
      });
      await publisher.publish({
        type: "job:status",
        payload: {
          jobId: updated.id,
          status: updated.status,
          stage: updated.stage,
          progress: updated.progress,
        },
      });
    }),
  );

  routes.post(
    "/jobs/:jobId/complete",
    validateParams(internalJobParamsSchema),
    validateBody(internalCompleteSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof internalCompleteSchema>;
      const updated = await prisma.job.update({
        where: { id: String(req.params.jobId) },
        data: {
          status: "COMPLETED",
          stage: "COMPLETED",
          progress: 100,
          verified: body.verified,
          residualRiskScore: body.residualRiskScore,
          residualRiskLevel: body.residualRiskLevel,
          verificationData: body.verificationData as Prisma.InputJsonObject,
          finishedAt: new Date(),
        },
      });
      await appendAuditEvent(prisma, {
        userId: updated.userId,
        jobId: updated.id,
        action: "JOB_COMPLETED",
        detail: { simulated: true, verified: body.verified },
      });
      await publisher.publish({
        type: "job:completed",
        payload: {
          jobId: updated.id,
          success: true,
          verified: body.verified,
          completedAt:
            updated.finishedAt?.toISOString() ?? new Date().toISOString(),
        },
      });
      res.json({
        success: true,
        data: { id: updated.id, status: updated.status, stage: updated.stage },
      });
    }),
  );

  routes.post(
    "/jobs/:jobId/fail",
    validateParams(internalJobParamsSchema),
    validateBody(internalFailSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof internalFailSchema>;
      const updated = await prisma.job.update({
        where: { id: String(req.params.jobId) },
        data: {
          status: "FAILED",
          stage: "FAILED",
          errorMessage: body.message,
          finishedAt: new Date(),
        },
      });
      await appendAuditEvent(prisma, {
        userId: updated.userId,
        jobId: updated.id,
        action: "JOB_FAILED",
        detail: { simulated: true, ...body.detail },
      });
      await publisher.publish({
        type: "job:failed",
        payload: {
          jobId: updated.id,
          success: false,
          verified: false,
          completedAt:
            updated.finishedAt?.toISOString() ?? new Date().toISOString(),
          errorMessage: body.message,
        },
      });
      res.json({
        success: true,
        data: { id: updated.id, status: updated.status, stage: updated.stage },
      });
    }),
  );

  routes.post(
    "/jobs/:jobId/audit",
    validateParams(internalJobParamsSchema),
    validateBody(internalAuditSchema),
    asyncHandler(async (req, res) => {
      const job = await prisma.job.findUnique({
        where: { id: String(req.params.jobId) },
      });
      if (!job) throw new AppError(404, "JOB_NOT_FOUND", "Job not found");
      const body = req.body as z.infer<typeof internalAuditSchema>;
      const entry = await appendAuditEvent(prisma, {
        userId: job.userId,
        jobId: job.id,
        action: body.action,
        detail: body.detail as Prisma.InputJsonObject,
      });
      res.json({
        success: true,
        data: { id: entry.id, eventHash: entry.eventHash },
      });
    }),
  );
  return routes;
}

export const internalRoutes: RouterType = createInternalRoutes();
