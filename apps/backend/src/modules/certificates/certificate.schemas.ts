import { z } from "zod";

export const certificatePayloadSchema = z.object({
  certificateNumber: z.string().min(1),
  jobId: z.uuid(),
  jobType: z.enum(["ERASE", "RECOVER"]).optional(),
  deviceSnapshot: z.record(z.string(), z.unknown()),
  method: z.string().min(1),
  standard: z.string().min(1),
  operatorReference: z.string().min(1),
  approvalReference: z.string().nullable(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  verificationResult: z.boolean(),
  residualRiskScore: z.number().min(0).max(1),
  residualRiskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  verificationDetail: z.record(z.string(), z.unknown()),
  toolMetadata: z.record(z.string(), z.unknown()),
  scope: z.string().min(1),
  targetDisplayName: z.string().min(1).optional(),
  targetPaths: z.array(z.string()).optional(),
  warnings: z.array(z.string()),
  limitations: z.array(z.string()),
});

export const internalCertificateSchema = z.object({
  payload: certificatePayloadSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  hashAlgorithm: z.literal("SHA-256"),
  signatureAlgorithm: z.literal("Ed25519"),
  signature: z.string().min(1),
  pdfPath: z.string().nullable(),
});

export const verifyCertificateSchema = z.object({
  payload: certificatePayloadSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(1),
});
