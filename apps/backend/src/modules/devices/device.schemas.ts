import { z } from "zod";

export const deviceIdParamsSchema = z.object({ id: z.uuid() });

export const erasePreviewSchema = z
  .object({
    deviceId: z.uuid(),
    eraseScope: z.enum(["WHOLE_DRIVE", "SPECIFIC_FILES"]),
    requestedMethod: z
      .enum([
        "OVERWRITE_SINGLE",
        "OVERWRITE_MULTI",
        "ATA_SECURE_ERASE",
        "NVME_SECURE_FORMAT",
        "CRYPTO_ERASE",
        "FILE_LEVEL_OVERWRITE",
      ])
      .optional(),
    standard: z.enum(["NIST_800_88", "DOD_5220_22_M"]).optional(),
  })
  .strict();

export type ErasePreviewInput = z.infer<typeof erasePreviewSchema>;
