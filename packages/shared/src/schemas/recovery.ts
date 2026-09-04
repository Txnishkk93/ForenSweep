import { z } from "zod";

export const recoveredFileResultSchema = z.object({
  id: z.uuid(),
  jobId: z.uuid(),
  fileName: z.string().nullable(),
  fileType: z.string(),
  offsetStart: z.string().regex(/^\\d+$/),
  offsetEnd: z.string().regex(/^\\d+$/),
  isFragmented: z.boolean(),
  confidenceScore: z.number().min(0).max(1),
  confidenceLevel: z.enum(["HIGH", "MEDIUM", "LOW"]),
  validationNotes: z.string().nullable(),
  storedPath: z.string(),
});

export type RecoveredFileResult = z.infer<typeof recoveredFileResultSchema>;
