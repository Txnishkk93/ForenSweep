import { z } from "zod";

export const loginSchema = z
  .object({
    identifier: z.string().trim().min(3).max(254),
    password: z.string().min(8).max(128),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
