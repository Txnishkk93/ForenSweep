import { z } from "zod";
import { eraseMethodSchema, eraseScopeSchema } from "@repo/shared";

export const jobIdParamsSchema = z.object({ id: z.uuid() });

export const createEraseJobSchema = z
  .object({
    deviceId: z.uuid(),
    eraseScope: eraseScopeSchema,
    requestedMethod: eraseMethodSchema.optional(),
    standard: z.enum(["NIST_800_88", "DOD_5220_22_M"]).optional(),
    typeToConfirm: z.string().trim().min(1).max(128),
    eraseFileList: z.array(z.string().min(1)).max(1000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.eraseScope === "SPECIFIC_FILES"
        ? Boolean(value.eraseFileList?.length)
        : !value.eraseFileList?.length,
    { message: "eraseFileList must match eraseScope", path: ["eraseFileList"] },
  );

export const createRecoveryJobSchema = z
  .object({
    deviceId: z.uuid().optional(),
    imageId: z.uuid().optional(),
    scanType: z.enum(["QUICK", "DEEP"]).default("QUICK"),
  })
  .strict()
  .refine((value) => Boolean(value.deviceId) !== Boolean(value.imageId), {
    message:
      "Provide exactly one registered deviceId or server-managed imageId",
  });

export const jobListQuerySchema = z.object({
  mine: z.enum(["true", "false"]).optional(),
});

export type CreateEraseJobInput = z.infer<typeof createEraseJobSchema>;
export type CreateRecoveryJobInput = z.infer<typeof createRecoveryJobSchema>;
