import { z } from "zod";

export const certificateVerificationSchema = z.object({
  certificateId: z.uuid(),
  valid: z.boolean(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  signatureVerified: z.boolean(),
  verifiedAt: z.iso.datetime(),
  errors: z.array(z.string()),
});

export type CertificateVerification = z.infer<
  typeof certificateVerificationSchema
>;
