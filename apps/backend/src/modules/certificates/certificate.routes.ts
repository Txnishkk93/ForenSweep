import { Router, type Router as RouterType } from "express";
import { stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { requireWorkerToken } from "../../middleware/worker-auth.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { sendSuccess } from "../../lib/serialize.js";
import { prisma } from "../../lib/prisma.js";
import { appendAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import {
  getCertificateForUser,
  getCertificateForDownload,
  listCertificates,
  listCertificatesForTarget,
  persistCertificate,
  verifyCertificate,
  authorizeRecoveryCertificate,
  auditRecoveryUpload,
} from "./certificate.service.js";
import {
  internalCertificateSchema,
  verifyCertificateSchema,
  authorizeRecoveryCertificateSchema,
  recoveryUploadAuditSchema,
} from "./certificate.schemas.js";

const idSchema = z.object({ id: z.uuid() });
export const internalCertificateRoutes: RouterType = Router();
internalCertificateRoutes.use(requireWorkerToken);
internalCertificateRoutes.post(
  "/certificates",
  validateBody(internalCertificateSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await persistCertificate(req.body), 201),
  ),
);

export const certificateRoutes: RouterType = Router();
certificateRoutes.use(requireAuth);
certificateRoutes.get(
  "/certificates",
  asyncHandler(async (req, res) =>
    sendSuccess(res, await listCertificates(req.auth!.userId, req.auth!.role === "ADMIN"), 200, {
      requestId: req.requestId,
    }),
  ),
);
certificateRoutes.get(
  "/certificates/for-target",
  asyncHandler(async (req, res) => {
    const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : undefined;
    const targetPath = typeof req.query.path === "string" ? req.query.path : undefined;
    const certificates = await listCertificatesForTarget(deviceId, targetPath, req.auth!.userId, req.auth!.role === "ADMIN");
    sendSuccess(res, certificates, 200, { requestId: req.requestId });
  }),
);
certificateRoutes.get(
  "/jobs/:id/certificate",
  validateParams(idSchema),
  asyncHandler(async (req, res) => {
    const job = await prisma.job.findUnique({
      where: { id: String(req.params.id) },
      select: { certificate: { select: { id: true } } },
    });
    if (!job?.certificate)
      throw new AppError(404, "CERTIFICATE_NOT_FOUND", "Certificate not found");
    sendSuccess(
      res,
      await getCertificateForUser(
        job.certificate.id,
        req.auth!.userId,
        req.auth!.role === "ADMIN",
      ),
      200,
      { requestId: req.requestId },
    );
  }),
);
certificateRoutes.get(
  "/certificates/:id",
  validateParams(idSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await getCertificateForUser(
        String(req.params.id),
        req.auth!.userId,
        req.auth!.role === "ADMIN",
      ),
      200,
      { requestId: req.requestId },
    ),
  ),
);
certificateRoutes.get(
  "/certificates/:id/download",
  validateParams(idSchema),
  asyncHandler(async (req, res) => {
    const certificate = await getCertificateForDownload(
      String(req.params.id),
    );
    if (!certificate.pdfPath)
      throw new AppError(
        404,
        "CERTIFICATE_PDF_NOT_FOUND",
        "Certificate PDF file not found on server",
      );

    const filePath = path.resolve(certificate.pdfPath);
    try {
      await stat(filePath);
    } catch {
      throw new AppError(
        404,
        "CERTIFICATE_PDF_NOT_FOUND",
        "Certificate PDF file not found on server",
      );
    }

    await appendAuditEvent(prisma, {
      userId: req.auth!.userId,
      jobId: certificate.jobId,
      action: "CERTIFICATE_DOWNLOADED",
      detail: { certificateId: certificate.id },
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="forensweep-certificate-${certificate.id}.pdf"`,
    );
    await new Promise<void>((resolve, reject) =>
      res.sendFile(filePath, (error) => (error ? reject(error) : resolve())),
    );
  }),
);
certificateRoutes.post(
  "/certificates/verify",
  requireRole("ADMIN", "OPERATOR", "INVESTIGATOR"),
  validateBody(verifyCertificateSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await verifyCertificate(req.body, req.auth!.userId), 200, {
      requestId: req.requestId,
    }),
  ),
);
certificateRoutes.post(
  "/certificates/authorize-recovery",
  validateBody(authorizeRecoveryCertificateSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await authorizeRecoveryCertificate(req.body, req.auth!.userId),
      200,
      { requestId: req.requestId },
    ),
  ),
);
certificateRoutes.post(
  "/certificates/recovery-upload-audit",
  validateBody(recoveryUploadAuditSchema),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await auditRecoveryUpload(req.body, req.auth!.userId), 201, {
      requestId: req.requestId,
    }),
  ),
);
