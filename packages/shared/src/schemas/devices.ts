import { z } from "zod";

export const deviceTypeSchema = z.enum([
  "HDD",
  "SSD",
  "USB",
  "SD_CARD",
  "UNKNOWN",
]);
export const deviceInterfaceSchema = z.enum([
  "SATA",
  "NVME",
  "USB",
  "SD_CARD",
  "UNKNOWN",
]);

export const deviceProfileSchema = z.object({
  id: z.uuid(),
  type: deviceTypeSchema,
  interface: deviceInterfaceSchema,
  model: z.string().nullable(),
  serial: z.string().nullable(),
  sizeBytes: z
    .string()
    .regex(/^\d+$/)
    .nullable(),
  supportsAta: z.boolean(),
  supportsNvme: z.boolean(),
  supportsSed: z.boolean(),
  supportsCryptoErase: z.boolean(),
  supportsSecureErase: z.boolean(),
  isSsd: z.boolean(),
  respondsToCommands: z.boolean(),
  lastSeenAt: z.iso.datetime(),
});

export const deviceIdSchema = z.object({ id: z.uuid() });

export type DeviceProfile = z.infer<typeof deviceProfileSchema>;

export type DeviceCapabilities = Pick<
  DeviceProfile,
  "supportsCryptoErase" | "supportsSecureErase" | "isSsd" | "respondsToCommands"
>;
