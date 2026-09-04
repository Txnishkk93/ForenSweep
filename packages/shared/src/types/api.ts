import type { z } from "zod";
import type { erasurePreviewResponseSchema } from "../schemas/jobs.js";

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiResponse<T> =
  { data: T; error?: never } | { data?: never; error: ApiError };

export type ErasurePreview = z.infer<typeof erasurePreviewResponseSchema>;
