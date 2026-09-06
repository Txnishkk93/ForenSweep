import { sha256 } from "@repo/crypto";
import { evaluateDevicePolicy } from "@repo/device-policy";
import type { DeviceProfile } from "@repo/shared";
import type { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import type { ErasePreviewInput } from "./device.schemas.js";
import { scanAndPersistDevices } from "./discovery.service.js";
import { cacheKeys, getCachedOrFetch, invalidateCache } from "../../lib/cache.js";

export type DeviceRecord = {
  id: string;
  path: string;
  type: "HDD" | "SSD" | "USB" | "SD_CARD" | "UNKNOWN";
  model: string | null;
  serial: string | null;
  sizeBytes: bigint | null;
  supportsAta: boolean;
  supportsNvme: boolean;
  supportsSed: boolean;
  mounted: boolean;
  isSystemDisk: boolean;
  capabilitySnapshot: unknown;
  lastSeenAt: Date;
};

export type DeviceStore = Pick<typeof prisma, "device" | "auditLog">;

function toProfile(device: DeviceRecord): DeviceProfile {
  const deviceInterface = device.supportsNvme
    ? "NVME"
    : device.supportsAta
      ? "SATA"
      : device.type === "USB"
        ? "USB"
        : device.type === "SD_CARD"
          ? "SD_CARD"
          : "UNKNOWN";
  return {
    id: device.id,
    type: device.type,
    interface: deviceInterface,
    model: device.model,
    serial: device.serial,
    sizeBytes: device.sizeBytes?.toString() ?? null,
    supportsAta: device.supportsAta,
    supportsNvme: device.supportsNvme,
    supportsSed: device.supportsSed,
    lastSeenAt: device.lastSeenAt.toISOString(),
  };
}

function findPolicy(
  device: DeviceRecord,
  eraseScope: "WHOLE_DRIVE" | "SPECIFIC_FILES",
  requestedMethod?: ErasePreviewInput["requestedMethod"],
) {
  const decision = evaluateDevicePolicy({
    device: toProfile(device),
    eraseScope,
    requestedMethod,
  });
  const warnings = [...decision.warnings];
  if (device.type === "USB" || device.type === "SD_CARD") {
    warnings.push(
      "USB and SD flash media provide limited assurance because controller remapping may retain data.",
    );
  }
  if (device.mounted) warnings.push("Mounted devices cannot be processed.");
  if (device.isSystemDisk) warnings.push("System disks cannot be processed.");
  return {
    ...decision,
    warnings,
    riskLevel:
      device.mounted || device.isSystemDisk ? "HIGH" : decision.riskLevel,
    allowedInSimulationMode:
      decision.allowedInSimulationMode &&
      !device.mounted &&
      !device.isSystemDisk,
  };
}

function assertProcessable(device: DeviceRecord): void {
  if (device.mounted)
    throw new AppError(
      409,
      "DEVICE_MOUNTED",
      "Mounted devices cannot be processed",
    );
  if (device.isSystemDisk)
    throw new AppError(
      409,
      "SYSTEM_DISK_PROTECTED",
      "System disks cannot be processed",
    );
}

async function audit(
  store: DeviceStore,
  userId: string,
  action: string,
  detail: Prisma.InputJsonObject,
): Promise<void> {
  await store.auditLog.create({
    data: {
      userId,
      action,
      detail,
      eventHash: sha256({ userId, action, detail }),
    },
  });
}

export async function listDevices(
  store: DeviceStore = prisma,
): Promise<ReturnType<typeof toProfile>[]> {
  const read = async () => {
    if (store === prisma) await scanAndPersistDevices();
    const devices = await store.device.findMany({ orderBy: { lastSeenAt: "desc" } });
    return devices.map((device) => ({ ...toProfile(device as DeviceRecord), path: device.path, mounted: device.mounted, isSystemDisk: device.isSystemDisk }));
  };
  return store === prisma ? getCachedOrFetch(cacheKeys.devices, 4, read) : read();
}

export async function refreshDevices(
  userId: string,
  store: DeviceStore = prisma,
) {
  if (store !== prisma) return refreshMockDevices(userId, store);
  const devices = await scanAndPersistDevices(true);
  await invalidateCache(cacheKeys.devices);
  return { refreshedAt: new Date().toISOString(), deviceCount: devices.length, simulated: false };
}

export async function getDevice(
  id: string,
  store: DeviceStore = prisma,
): Promise<DeviceRecord> {
  const device = await store.device.findUnique({ where: { id } });
  if (!device) throw new AppError(404, "DEVICE_NOT_FOUND", "Device not found");
  return device as DeviceRecord;
}

export async function getDeviceProfile(
  id: string,
  store: DeviceStore = prisma,
) {
  const device = await getDevice(id, store);
  return {
    ...toProfile(device),
    path: device.path,
    ...findPolicy(device, "WHOLE_DRIVE"),
    realOperationSupported: env.REAL_DEVICE_OPERATIONS,
  };
}

export async function refreshMockDevices(
  userId: string,
  store: DeviceStore = prisma,
) {
  const devices = await store.device.findMany();
  const refreshedAt = new Date();
  for (const device of devices) {
    await store.device.update({
      where: { id: device.id },
      data: { lastSeenAt: refreshedAt },
    });
    await audit(store, userId, "DEVICE_SCAN", {
      deviceId: device.id,
      simulated: true,
      refreshedAt: refreshedAt.toISOString(),
    });
  }
  return {
    refreshedAt: refreshedAt.toISOString(),
    deviceCount: devices.length,
    simulated: true,
  };
}

export async function previewErase(
  input: ErasePreviewInput,
  userId: string,
  store: DeviceStore = prisma,
) {
  const device = await getDevice(input.deviceId, store);
  const policy = findPolicy(device, input.eraseScope, input.requestedMethod);
  const requestedMethodAccepted =
    input.requestedMethod === undefined ||
    input.requestedMethod === policy.recommendedMethod;
  const warnings = [...policy.warnings];
  if (input.eraseScope === "SPECIFIC_FILES" && device.type === "SSD")
    warnings.push(
      "Logical file erasure does not prove physical-cell sanitization on SSD media.",
    );
  const result = {
    device: { ...toProfile(device), path: device.path },
    ...policy,
    canProceed:
      !device.mounted && !device.isSystemDisk && requestedMethodAccepted,
    rejectionReason: device.mounted
      ? "DEVICE_MOUNTED"
      : device.isSystemDisk
        ? "SYSTEM_DISK_PROTECTED"
        : !requestedMethodAccepted
          ? "UNSAFE_REQUESTED_METHOD"
          : null,
    requestedMethod: input.requestedMethod ?? null,
    requestedMethodAccepted,
    requestedMethodRejected: !requestedMethodAccepted,
    warnings,
    riskLevel:
      device.mounted || device.isSystemDisk || !requestedMethodAccepted
        ? "HIGH"
        : policy.riskLevel,
    typeToConfirm: device.isSystemDisk || device.mounted ? null : "ERASE",
    requiresApproval:
      policy.requiresApproval ||
      device.mounted ||
      device.isSystemDisk ||
      !requestedMethodAccepted,
    simulationAvailable:
      policy.allowedInSimulationMode && !env.REAL_DEVICE_OPERATIONS,
    realOperationSupported: env.REAL_DEVICE_OPERATIONS,
  };
  await audit(store, userId, "ERASE_PREVIEW", {
    deviceId: device.id,
    eraseScope: input.eraseScope,
    requestedMethod: input.requestedMethod ?? null,
    recommendedMethod: policy.recommendedMethod,
  });
  return result;
}

export { assertProcessable };
