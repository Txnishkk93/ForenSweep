import { z } from "zod";
import { eraseMethodSchema, eraseScopeSchema } from "@repo/shared";
import { certificatePayloadSchema } from "../certificates/certificate.schemas.js";

export const jobIdParamsSchema = z.object({ id: z.uuid() });

export const createEraseJobSchema = z
  .object({
    deviceId: z.uuid().optional(),
    eraseScope: eraseScopeSchema,
    requestedMethod: eraseMethodSchema.optional(),
    standard: z.enum(["NIST_800_88", "DOD_5220_22_M"]).optional(),
    typeToConfirm: z.string().trim().min(1).max(128),
    operatorSerial: z.string().trim().min(1).max(256).optional(),
    physicalIsolationAttested: z.boolean().optional(),
    hardwareConfirmationPhrase: z.string().min(1).max(256).optional(),
    eraseFileList: z.array(z.string().min(1)).max(1000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.eraseScope === "SPECIFIC_FILES"
        ? Boolean(value.eraseFileList?.length)
        : !value.eraseFileList?.length,
    { message: "eraseFileList must match eraseScope", path: ["eraseFileList"] },
  )
  .refine((value) => value.eraseScope === "SPECIFIC_FILES" || Boolean(value.deviceId), {
    message: "deviceId is required for whole-device erasure",
    path: ["deviceId"],
  });

export const createRecoveryJobSchema = z
  .object({
    deviceId: z.uuid().optional(),
    imageId: z.uuid().optional(),
    scanType: z.enum(["QUICK", "DEEP"]).default("QUICK"),
    certificateId: z.uuid().optional(),
    certificateVerification: z.object({
      payload: certificatePayloadSchema,
      contentHash: z.string().regex(/^[a-f0-9]{64}$/),
      signature: z.string().min(1),
    }).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.deviceId) !== Boolean(value.imageId), {
    message:
      "Provide exactly one registered deviceId or server-managed imageId",
  });

export const jobListQuerySchema = z.object({
  mine: z.enum(["true", "false"]).optional(),
});

export const approveJobSchema = z.object({
  approvalPassword: z.string().min(8).max(128).optional(),
}).strict();

export type CreateEraseJobInput = z.infer<typeof createEraseJobSchema>;
export type CreateRecoveryJobInput = z.infer<typeof createRecoveryJobSchema>;
