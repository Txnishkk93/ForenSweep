import { Prisma } from "@prisma/client";
import type {
  CreateEraseJobInput,
  CreateRecoveryJobInput,
} from "./job.schemas.js";
import { evaluateDevicePolicy } from "@repo/device-policy";
import { prisma } from "../../lib/prisma.js";
import { appendAuditEvent, type AuditStore } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import type { DeviceRecord } from "../devices/device.service.js";

export type JobStore = Pick<typeof prisma, "device" | "job" | "auditLog">;

function getDeviceProfile(device: DeviceRecord) {
  return {
    id: device.id,
    type: device.type,
    interface: device.supportsNvme
      ? ("NVME" as const)
      : device.supportsAta
        ? ("SATA" as const)
        : device.type === "USB"
          ? ("USB" as const)
          : device.type === "SD_CARD"
            ? ("SD_CARD" as const)
            : ("UNKNOWN" as const),
    model: device.model,
    serial: device.serial,
    sizeBytes: device.sizeBytes?.toString() ?? null,
    supportsAta: device.supportsAta,
    supportsNvme: device.supportsNvme,
    supportsSed: device.supportsSed,
    lastSeenAt: device.lastSeenAt.toISOString(),
  };
}

async function loadDevice(
  deviceId: string,
  store: JobStore,
): Promise<DeviceRecord> {
  const device = await store.device.findUnique({ where: { id: deviceId } });
  if (!device) throw new AppError(404, "DEVICE_NOT_FOUND", "Device not found");
  return device as DeviceRecord;
}

function assertSafeDevice(device: DeviceRecord): void {
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

function confirmationValues(device: DeviceRecord): string[] {
  return [device.serial, "ERASE"].filter((value): value is string =>
    Boolean(value),
  );
}

export async function createEraseJob(
  input: CreateEraseJobInput,
  userId: string,
  store: JobStore = prisma,
) {
  const device = await loadDevice(input.deviceId, store);
  assertSafeDevice(device);
  const policy = evaluateDevicePolicy({
    device: getDeviceProfile(device),
    eraseScope: input.eraseScope,
    requestedMethod: input.requestedMethod,
  });
  if (
    input.requestedMethod &&
    input.requestedMethod !== policy.recommendedMethod
  ) {
    throw new AppError(
      409,
      "UNSAFE_REQUESTED_METHOD",
      "Requested erase method is not safe for this device",
    );
  }
  if (!confirmationValues(device).includes(input.typeToConfirm)) {
    throw new AppError(
      400,
      "INVALID_CONFIRMATION",
      "Type-to-confirm value is invalid",
    );
  }
  const job = await store.job.create({
    data: {
      type: "ERASE",
      status: "QUEUED",
      stage: "WAITING_FOR_APPROVAL",
      progress: 0,
      currentPass: 0,
      totalPasses: policy.recommendedMethod === "OVERWRITE_MULTI" ? 3 : 1,
      progressDetail: {
        requestedMethod: input.requestedMethod ?? null,
        recommendedMethod: policy.recommendedMethod,
      },
      deviceId: device.id,
      userId,
      approvalStatus: "PENDING",
      eraseMethod: policy.recommendedMethod,
      eraseScope: input.eraseScope,
      eraseFileList: input.eraseFileList ?? Prisma.JsonNull,
      standard: input.standard ?? "NIST_800_88",
      residualRiskLevel: policy.riskLevel,
    },
  });
  await appendAuditEvent(store, {
    userId,
    jobId: job.id,
    action: "ERASE_REQUESTED",
    detail: {
      deviceId: device.id,
      eraseScope: input.eraseScope,
      eraseMethod: policy.recommendedMethod,
    },
  });
  return job;
}

export async function approveEraseJob(
  id: string,
  approverId: string,
  store: JobStore = prisma,
) {
  const job = await store.job.findUnique({ where: { id } });
  if (!job) throw new AppError(404, "JOB_NOT_FOUND", "Job not found");
  if (job.type !== "ERASE" || job.approvalStatus !== "PENDING")
    throw new AppError(
      409,
      "JOB_NOT_PENDING",
      "Only pending erase jobs can be approved",
    );
  const approvedAt = new Date();
  const updated = await store.job.update({
    where: { id },
    data: { approvalStatus: "APPROVED", approvedById: approverId, approvedAt },
  });
  await appendAuditEvent(store, {
    userId: approverId,
    jobId: id,
    action: "ERASE_APPROVED",
    detail: { approvedAt: approvedAt.toISOString() },
  });
  // TODO: enqueue the approved job when the worker/queue integration is implemented.
  return updated;
}

export async function cancelJob(
  id: string,
  userId: string,
  isAdmin: boolean,
  store: JobStore = prisma,
) {
  const job = await store.job.findUnique({ where: { id } });
  if (!job) throw new AppError(404, "JOB_NOT_FOUND", "Job not found");
  if (!isAdmin && job.userId !== userId)
    throw new AppError(
      403,
      "FORBIDDEN",
      "You do not have permission to cancel this job",
    );
  if (
    job.status !== "QUEUED" ||
    (job.type === "ERASE" &&
      !["PENDING", "NOT_REQUIRED"].includes(job.approvalStatus))
  )
    throw new AppError(
      409,
      "JOB_NOT_CANCELLABLE",
      "Only queued or pending jobs can be cancelled",
    );
  const updated = await store.job.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  await appendAuditEvent(store, {
    userId,
    jobId: id,
    action: "JOB_CANCELLED",
    detail: { cancelledBy: userId },
  });
  return updated;
}

export async function createRecoveryJob(
  input: CreateRecoveryJobInput,
  userId: string,
  store: JobStore = prisma,
) {
  const device = input.deviceId
    ? await loadDevice(input.deviceId, store)
    : null;
  if (device) assertSafeDevice(device);
  const job = await store.job.create({
    data: {
      type: "RECOVER",
      status: "QUEUED",
      stage: "QUEUED",
      progress: 0,
      currentPass: 0,
      totalPasses: 0,
      progressDetail: {},
      deviceId: device?.id,
      userId,
      scanType: input.scanType,
      sourceImagePath: input.imageId
        ? `managed-image:${input.imageId}`
        : undefined,
    },
  });
  await appendAuditEvent(store, {
    userId,
    jobId: job.id,
    action: "RECOVERY_REQUESTED",
    detail: {
      deviceId: device?.id ?? null,
      imageId: input.imageId ?? null,
      scanType: input.scanType,
    },
  });
  return job;
}

export async function listJobs(
  userId: string,
  isAdmin: boolean,
  store: JobStore = prisma,
) {
  return store.job.findMany({
    where: isAdmin ? undefined : { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getJob(
  id: string,
  userId: string,
  isAdmin: boolean,
  store: JobStore = prisma,
) {
  const job = await store.job.findUnique({ where: { id } });
  if (!job) throw new AppError(404, "JOB_NOT_FOUND", "Job not found");
  if (!isAdmin && job.userId !== userId)
    throw new AppError(
      403,
      "FORBIDDEN",
      "You do not have permission to access this job",
    );
  return job;
}

export async function getJobAudit(
  id: string,
  userId: string,
  isAdmin: boolean,
  store: JobStore = prisma,
) {
  await getJob(id, userId, isAdmin, store);
  return store.auditLog.findMany({
    where: { jobId: id },
    orderBy: { timestamp: "asc" },
  });
}
