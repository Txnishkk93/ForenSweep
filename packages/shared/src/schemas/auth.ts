import { z } from "zod";

export const userRoleSchema = z.enum(["ADMIN", "OPERATOR", "INVESTIGATOR"]);

export const signupInputSchema = z.object({
  username: z.string().trim().min(1).max(100),
  email: z.email(),
  passwordHash: z.string().min(1),
});

export const userProfileSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  email: z.email(),
  role: userRoleSchema,
  createdAt: z.iso.datetime(),
});

export type SignupInput = z.infer<typeof signupInputSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
