import { z } from "zod";

export const recoveredFileResultSchema = z.object({
  id: z.uuid(),
  jobId: z.uuid(),
  fileName: z.string().nullable(),
  fileType: z.enum(["JPEG", "PDF", "PNG", "ZIP", "DOCX"]),
  mimeType: z.string().nullable().optional(),
  offsetStart: z.string().regex(/^\\d+$/),
  offsetEnd: z.string().regex(/^\\d+$/),
  isFragmented: z.boolean(),
  isTruncated: z.boolean().optional(),
  fragmentCount: z.number().int().positive().optional(),
  confidenceScore: z.number().min(0).max(1),
  confidenceLevel: z.enum(["HIGH", "MEDIUM", "LOW"]),
  scoreBreakdown: z.record(z.string(), z.unknown()).optional(),
  validationNotes: z.unknown().nullable().optional(),
  sha256: z.string().nullable().optional(),
  storedPath: z.string(),
  previewPath: z.string().nullable().optional(),
  previewAvailable: z.boolean().optional(),
  fragmentationStatus: z.literal("NOT_ATTEMPTED").optional(),
});

export type RecoveredFileResult = z.infer<typeof recoveredFileResultSchema>;
