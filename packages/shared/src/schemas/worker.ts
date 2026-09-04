import { z } from "zod";
import { JOB_STAGES } from "../constants/job-stages.js";

export const workerProgressSchema = z.object({
  jobId: z.uuid(),
  stage: z.enum(JOB_STAGES),
  progress: z.number().int().min(0).max(100),
  message: z.string().optional(),
  bytesProcessed: z
    .string()
    .regex(/^\\d+$/)
    .optional(),
  bytesTotal: z
    .string()
    .regex(/^\\d+$/)
    .optional(),
});

export const workerCompletionSchema = z.object({
  jobId: z.uuid(),
  success: z.boolean(),
  verified: z.boolean(),
  completedAt: z.iso.datetime(),
  errorMessage: z.string().optional(),
  certificatePayload: z.record(z.string(), z.unknown()).optional(),
});

export type WorkerProgress = z.infer<typeof workerProgressSchema>;
export type WorkerCompletion = z.infer<typeof workerCompletionSchema>;
