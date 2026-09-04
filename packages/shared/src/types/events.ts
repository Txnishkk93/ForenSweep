import { z } from "zod";
import {
  workerCompletionSchema,
  workerProgressSchema,
} from "../schemas/worker.js";
import { recoveredFileResultSchema } from "../schemas/recovery.js";

export const jobEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("JOB_PROGRESS"), payload: workerProgressSchema }),
  z.object({
    type: z.literal("JOB_COMPLETED"),
    payload: workerCompletionSchema,
  }),
  z.object({
    type: z.literal("RECOVERED_FILE"),
    payload: recoveredFileResultSchema,
  }),
  z.object({ type: z.literal("JOB_FAILED"), payload: workerCompletionSchema }),
]);

export type JobEvent = z.infer<typeof jobEventSchema>;
