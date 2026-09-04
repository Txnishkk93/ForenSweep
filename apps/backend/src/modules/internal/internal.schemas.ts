import { z } from "zod";
import { JOB_STAGES } from "@repo/shared";

export const internalJobParamsSchema = z.object({ jobId: z.uuid() });
export const internalProgressSchema = z.object({
  stage: z.enum(JOB_STAGES),
  progress: z.number().int().min(0).max(100),
  currentPass: z.number().int().min(0).optional(),
  totalPasses: z.number().int().min(0).optional(),
  progressDetail: z.record(z.string(), z.unknown()).default({}),
  bytesProcessed: z.string().regex(/^\d+$/).optional(),
  bytesTotal: z.string().regex(/^\d+$/).optional(),
});
export const internalCompleteSchema = z.object({
  verified: z.boolean(),
  residualRiskScore: z.number().min(0).max(1).optional(),
  residualRiskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  verificationData: z.record(z.string(), z.unknown()).default({}),
});
export const internalFailSchema = z.object({
  message: z.string().min(1).max(1000),
  detail: z.record(z.string(), z.unknown()).default({}),
});
export const internalAuditSchema = z.object({
  action: z.string().min(1).max(100),
  detail: z.record(z.string(), z.unknown()).default({}),
});
