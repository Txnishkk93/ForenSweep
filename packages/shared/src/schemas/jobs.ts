import { z } from "zod";
import { ERASE_METHODS } from "../constants/erase-methods.js";
import { ERASURE_STANDARDS } from "../constants/standards.js";
import { JOB_STAGES } from "../constants/job-stages.js";

export const eraseScopeSchema = z.enum(["WHOLE_DRIVE", "SPECIFIC_FILES"]);
export const jobTypeSchema = z.enum(["ERASE", "RECOVER"]);
export const jobStatusSchema = z.enum(JOB_STAGES);
export const eraseMethodSchema = z.enum(ERASE_METHODS);
export const standardSchema = z.enum(ERASURE_STANDARDS);

export const createEraseJobInputSchema = z
  .object({
    deviceId: z.uuid(),
    scope: eraseScopeSchema,
    filePaths: z.array(z.string().min(1)).max(1000).optional(),
    requestedMethod: eraseMethodSchema.optional(),
    standard: standardSchema.default("NIST_SP_800_88"),
  })
  .refine(
    (input) =>
      input.scope === "SPECIFIC_FILES"
        ? Boolean(input.filePaths?.length)
        : !input.filePaths?.length,
    {
      message: "filePaths must match the requested erase scope",
      path: ["filePaths"],
    },
  );

export const createRecoveryJobInputSchema = z.object({
  deviceId: z.uuid(),
  sourceImageId: z.uuid(),
  scanType: z.enum(["QUICK", "DEEP"]).default("QUICK"),
});

export const erasurePreviewResponseSchema = z.object({
  deviceId: z.uuid(),
  scope: eraseScopeSchema,
  recommendedMethod: eraseMethodSchema,
  sanitizationLabel: z.string(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  warnings: z.array(z.string()),
  requiresApproval: z.boolean(),
  allowedInSimulationMode: z.boolean(),
});

export const jobSummarySchema = z.object({
  id: z.uuid(),
  type: jobTypeSchema,
  status: jobStatusSchema,
  progress: z.number().int().min(0).max(100),
  createdAt: z.iso.datetime(),
});

export type CreateEraseJobInput = z.infer<typeof createEraseJobInputSchema>;
export type CreateRecoveryJobInput = z.infer<
  typeof createRecoveryJobInputSchema
>;
export type ErasurePreviewResponse = z.infer<
  typeof erasurePreviewResponseSchema
>;
