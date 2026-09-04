import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { requireWorkerToken } from "../../middleware/worker-auth.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { sendSuccess } from "../../lib/serialize.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import {
  getCertificateForUser,
  persistCertificate,
  verifyCertificate,
} from "./certificate.service.js";
import {
  internalCertificateSchema,
  verifyCertificateSchema,
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
