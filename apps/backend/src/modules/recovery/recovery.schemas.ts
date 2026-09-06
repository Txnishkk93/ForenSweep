import { z } from "zod";

export const recoveredFileSchema = z.object({
  fileName: z.string().nullable().optional(),
  fileType: z.enum(["JPEG", "PDF", "PNG", "ZIP", "DOCX"]),
  mimeType: z.string().nullable().optional(),
  offsetStart: z.string().regex(/^\d+$/),
  offsetEnd: z.string().regex(/^\d+$/),
  isFragmented: z.boolean().default(false),
  isTruncated: z.boolean().default(false),
  fragmentCount: z.number().int().positive().default(1),
  confidenceScore: z.number().min(0).max(1),
  confidenceLevel: z.enum(["HIGH", "MEDIUM", "LOW"]),
  scoreBreakdown: z.record(z.string(), z.unknown()).optional(),
  validationNotes: z.unknown().optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  storedPath: z.string().min(1),
  previewPath: z.string().nullable().optional(),
  previewAvailable: z.boolean().optional(),
  fragmentationStatus: z.literal("NOT_ATTEMPTED").optional(),
});
