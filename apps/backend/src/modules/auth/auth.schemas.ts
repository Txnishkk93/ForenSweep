import { z } from "zod";

export const loginSchema = z
  .object({
    identifier: z.string().trim().min(3).max(254),
    password: z.string().min(8).max(128),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    username: z.string().trim().min(3).max(50),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
  })
  .strict();

export type SignupInput = z.infer<typeof signupSchema>;
