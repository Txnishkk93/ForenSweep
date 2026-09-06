import { z } from "zod";

const deviceSyncRecordSchema = z.object({
  path: z.string().regex(/^\/dev\/[A-Za-z0-9._-]+$/),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  size: z.string().regex(/^\d+$/).nullable(),
  mounted: z.boolean(),
  system_disk: z.boolean(),
  rotational: z.boolean().nullable(),
  transport: z.enum(["sata", "ata", "nvme", "usb", "scsi", "mmc", "unknown"]),
  supports_ata: z.boolean(),
  supports_nvme: z.boolean(),
  supports_sed: z.boolean(),
  capability_evidence: z.record(z.string(), z.unknown()),
}).strict();

export const deviceSyncSchema = z.object({
  devices: z.array(deviceSyncRecordSchema).max(256),
}).strict();

export type DeviceSyncInput = z.infer<typeof deviceSyncSchema>;