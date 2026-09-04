import { z } from "zod";
import {
  jobStatusEventSchema,
  jobWarningEventSchema,
  workerCompletionSchema,
  workerProgressSchema,
} from "../schemas/worker.js";
import { recoveredFileResultSchema } from "../schemas/recovery.js";

export const jobEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("job:progress"), payload: workerProgressSchema }),
  z.object({
    type: z.literal("job:completed"),
    payload: workerCompletionSchema,
  }),
  z.object({
    type: z.literal("job:status"),
    payload: jobStatusEventSchema,
  }),
  z.object({ type: z.literal("job:warning"), payload: jobWarningEventSchema }),
  z.object({ type: z.literal("job:failed"), payload: workerCompletionSchema }),
  z.object({
    type: z.literal("recovered:file"),
    payload: recoveredFileResultSchema,
  }),
]);

export type JobEvent = z.infer<typeof jobEventSchema>;
