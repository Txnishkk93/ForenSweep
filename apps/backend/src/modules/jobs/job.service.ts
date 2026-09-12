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
import type { JobQueue } from "../../lib/queues.js";
import { env, hardwareDemoGate } from "../../config/env.js";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { resolveAvailableImage } from "../acquisitions/acquisition.service.js";
import { cacheKeys, getCachedOrFetch, invalidateCache } from "../../lib/cache.js";
import { validateErasePaths } from "../filesystem/filesystem.service.js";

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

function assertSafeDevice(device: DeviceRecord, eraseScope: CreateEraseJobInput["eraseScope"]): void {
  if (device.mounted && eraseScope === "WHOLE_DRIVE")
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

function protectedDevice(device: DeviceRecord): boolean {
  try {
    const raw = fs.readFileSync(env.PROTECTED_DEVICES_PATH, "utf8");
    const entries = JSON.parse(raw) as Array<{ serial?: string; model?: string }>;
    return entries.some(
      (entry) =>
        (entry.serial && entry.serial === device.serial) ||
        (entry.model && entry.model === device.model),
    );
  } catch {
    return false;
  }
}

function assertHardwareEligibility(device: DeviceRecord, input: CreateEraseJobInput): void {
  if (!hardwareDemoGate) throw new AppError(409, "HARDWARE_MODE_DISABLED", "Real hardware mode is disabled");
  if (input.requestedMethod !== "OVERWRITE_SINGLE") throw new AppError(409, "HARDWARE_METHOD_NOT_ALLOWED", "Only OVERWRITE_SINGLE is allowed for hardware mode");
  if (input.eraseScope !== "WHOLE_DRIVE") throw new AppError(409, "HARDWARE_SCOPE_NOT_ALLOWED", "Hardware mode only supports whole-device scope");
  const evidence = (device.capabilitySnapshot ?? {}) as Record<string, unknown>;
  const transport = typeof evidence.transport === "string" ? evidence.transport : "unknown";
  if (evidence.removable !== true) throw new AppError(409, "HARDWARE_NOT_REMOVABLE", "Device is not removable");
  if (transport !== "usb") throw new AppError(409, "HARDWARE_NOT_USB", "Device is not USB transport");
  if (evidence.ssd === true || evidence.ssdIdentity === true) throw new AppError(409, "HARDWARE_SSD_REJECTED", "SSD/NVMe devices are not allowed");
  if (device.mounted) throw new AppError(409, "HARDWARE_MOUNTED", "Device is mounted");
  if (device.isSystemDisk) throw new AppError(409, "HARDWARE_SYSTEM_DISK", "System disks are not allowed");
  if (device.sizeBytes === null || device.sizeBytes > hardwareDemoGate.maxCapacityBytes) throw new AppError(409, "HARDWARE_CAPACITY_EXCEEDED", "Device exceeds the hardware demo capacity limit");
  if (protectedDevice(device)) throw new AppError(409, "HARDWARE_PROTECTED_DEVICE", "Device matches the protected device denylist");
  if (input.operatorSerial !== device.serial) throw new AppError(400, "HARDWARE_SERIAL_MISMATCH", "Operator serial does not match the device");
  if (input.physicalIsolationAttested !== true) throw new AppError(400, "HARDWARE_ISOLATION_REQUIRED", "Physical isolation attestation is required");
  if (input.hardwareConfirmationPhrase !== hardwareDemoGate.confirmPhrase) throw new AppError(400, "HARDWARE_CONFIRMATION_INVALID", "Hardware confirmation phrase is invalid");
}

export async function createEraseJob(
  input: CreateEraseJobInput,
  userId: string,
  store: JobStore = prisma,
  queue?: JobQueue,
) {
  const localFileJob = input.eraseScope === "SPECIFIC_FILES" && !input.deviceId;
  const device = input.deviceId ? await loadDevice(input.deviceId, store) : null;
  const resolvedFileList = localFileJob
    ? await validateErasePaths(input.eraseFileList ?? [])
    : input.eraseFileList ?? [];
  if (localFileJob && !resolvedFileList.length)
    throw new AppError(400, "ERASE_TARGET_REQUIRED", "At least one local file or folder is required");
  const hardwareJob = input.requestedMethod === "OVERWRITE_SINGLE" && hardwareDemoGate !== null;
  if (device && hardwareJob) assertHardwareEligibility(device, input);
  if (device) assertSafeDevice(device, input.eraseScope);
  const policy = device
    ? evaluateDevicePolicy({
        device: getDeviceProfile(device),
        eraseScope: input.eraseScope,
        requestedMethod: input.requestedMethod,
      })
    : {
        recommendedMethod: "FILE_LEVEL_OVERWRITE" as const,
        riskLevel: "HIGH" as const,
        warnings: ["File-level overwrites cannot guarantee physical-cell erasure on SSD media."],
      };
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
  if (!(device ? confirmationValues(device) : ["ERASE"]).includes(input.typeToConfirm)) {
    throw new AppError(
      400,
      "INVALID_CONFIRMATION",
      "Type-to-confirm value is invalid",
    );
  }
  const requiresApproval = hardwareJob || input.eraseScope === "SPECIFIC_FILES";
  const job = await store.job.create({
    data: {
      type: "ERASE",
      status: "QUEUED",
      stage: requiresApproval ? "WAITING_FOR_APPROVAL" : "QUEUED",
      progress: 0,
      currentPass: 0,
      totalPasses: policy.recommendedMethod === "OVERWRITE_MULTI" ? 3 : 1,
      progressDetail: {
        requestedMethod: input.requestedMethod ?? null,
        recommendedMethod: policy.recommendedMethod,
        ...(localFileJob ? { erasePaths: resolvedFileList } : {}),
        ...(hardwareJob && device
          ? {
              hardware: true,
              operatorSerial: input.operatorSerial,
              physicalIsolationAttested: true,
              capturedDevice: {
                path: device.path,
                serial: device.serial,
                model: device.model,
                sizeBytes: device.sizeBytes?.toString() ?? null,
                mounted: device.mounted,
                isSystemDisk: device.isSystemDisk,
                removable: (device.capabilitySnapshot as Record<string, unknown> | null)?.removable ?? false,
                transport: (device.capabilitySnapshot as Record<string, unknown> | null)?.transport ?? "unknown",
                rotational: (device.capabilitySnapshot as Record<string, unknown> | null)?.rotational ?? null,
                capabilitySnapshot: device.capabilitySnapshot,
              } as Prisma.InputJsonObject,
            }
          : {}),
      },
      deviceId: device?.id,
      userId,
      approvalStatus: requiresApproval ? "PENDING" : "NOT_REQUIRED",
      eraseMethod: policy.recommendedMethod,
      eraseScope: input.eraseScope,
      eraseFileList: resolvedFileList ?? Prisma.JsonNull,
      standard: input.standard ?? "NIST_800_88",
      residualRiskLevel: policy.riskLevel,
    },
  });
  await invalidateCache(cacheKeys.jobs(userId, 1, 50));
  await invalidateCache(cacheKeys.jobSummary(userId));
  await appendAuditEvent(store, {
    userId,
    jobId: job.id,
    action: "ERASE_REQUESTED",
    detail: {
      deviceId: device?.id ?? null,
      eraseScope: input.eraseScope,
      eraseMethod: policy.recommendedMethod,
      ...(localFileJob ? { paths: resolvedFileList } : {}),
    },
  });
  if (queue && !requiresApproval) await queue.addErase(job.id);
  return job;
}

export async function approveEraseJob(
  id: string,
  approverId: string,
  store: JobStore = prisma,
  queue?: JobQueue,
  approvalPassword?: string,
) {
  const job = await store.job.findUnique({ where: { id } });
  if (!job) throw new AppError(404, "JOB_NOT_FOUND", "Job not found");
  if (job.type !== "ERASE" || job.approvalStatus !== "PENDING")
    throw new AppError(
      409,
      "JOB_NOT_PENDING",
      "Only pending erase jobs can be approved",
    );
  const progressDetail = (job.progressDetail ?? {}) as Record<string, unknown>;
  if (progressDetail.hardware === true) {
    if (job.userId === approverId)
      throw new AppError(403, "HARDWARE_APPROVER_MUST_DIFFER", "A second user must approve hardware erasure");
    const createdAt = job.createdAt.getTime();
    if (Date.now() - createdAt < 10_000)
      throw new AppError(409, "HARDWARE_APPROVAL_TOO_SOON", "Hardware approval requires a 10 second review delay");
    if (!approvalPassword)
      throw new AppError(400, "HARDWARE_REAUTH_REQUIRED", "Re-enter the admin password to approve hardware erasure");
    const approver = await prisma.user.findUnique({ where: { id: approverId } });
    if (!approver || !(await bcrypt.compare(approvalPassword, approver.passwordHash)))
      throw new AppError(401, "HARDWARE_REAUTH_INVALID", "Admin password re-authentication failed");
  }
  const approvedAt = new Date();
  const updated = await store.job.update({
    where: { id },
    data: { approvalStatus: "APPROVED", approvedById: approverId, approvedAt },
  });
  await invalidateCache(cacheKeys.jobs(job.userId, 1, 50));
  await invalidateCache(cacheKeys.jobSummary(job.userId));
  await appendAuditEvent(store, {
    userId: approverId,
    jobId: id,
    action: "ERASE_APPROVED",
    detail: { approvedAt: approvedAt.toISOString() },
  });
  if (queue) await queue.addErase(updated.id);
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
  const hardwareRunning =
    job.type === "ERASE" &&
    job.status === "RUNNING" &&
    (job.progressDetail as Record<string, unknown> | null)?.hardware === true;
  if (
    (!hardwareRunning && job.status !== "QUEUED") ||
    (job.type === "ERASE" &&
      !hardwareRunning &&
      !["PENDING", "NOT_REQUIRED"].includes(job.approvalStatus))
  )
    throw new AppError(
      409,
      "JOB_NOT_CANCELLABLE",
      "Only queued or pending jobs can be cancelled",
    );
  const updated = await store.job.update({
    where: { id },
    data: { status: "CANCELLED", errorMessage: hardwareRunning ? "Cancelled by operator" : undefined },
  });
  await invalidateCache(cacheKeys.jobs(job.userId, 1, 50));
  await invalidateCache(cacheKeys.jobSummary(job.userId));
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
  queue?: JobQueue,
) {
  const device = input.deviceId
    ? await loadDevice(input.deviceId, store)
    : null;
  if (device) assertSafeDevice(device, "WHOLE_DRIVE");
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
        ? store === prisma
          ? await resolveAvailableImage(input.imageId)
          : `managed-image:${input.imageId}`
        : undefined,
    },
  });
  await invalidateCache(cacheKeys.jobs(userId, 1, 50));
  await invalidateCache(cacheKeys.jobSummary(userId));
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
  if (queue) await queue.addRecover(job.id);
  return job;
}

export async function listJobs(
  userId: string,
  isAdmin: boolean,
  store: JobStore = prisma,
) {
  const page = 1;
  const pageSize = 50;
  return getCachedOrFetch(cacheKeys.jobs(userId, page, pageSize), 7, () => store.job.findMany({
    where: isAdmin ? undefined : { userId },
    include: { device: true, certificate: true },
    orderBy: { createdAt: "desc" },
    take: pageSize,
  }));
}

export async function getJobSummary(
  userId: string,
  isAdmin: boolean,
  store: JobStore = prisma,
) {
  const read = async () => {
    const grouped = await store.job.groupBy({
      by: ["status"],
      where: isAdmin ? undefined : { userId },
      _count: { _all: true },
    });
    return Object.fromEntries(grouped.map((entry) => [entry.status, entry._count._all]));
  };
  return store === prisma ? getCachedOrFetch(cacheKeys.jobSummary(userId), 7, read) : read();
}

export async function listAuditEvents(
  userId: string,
  isAdmin: boolean,
  page = 1,
  pageSize = 100,
  store: JobStore = prisma,
) {
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const read = () => store.auditLog.findMany({
    where: isAdmin ? undefined : { job: { userId } },
    orderBy: { timestamp: "desc" },
    take: safeSize,
    skip: (safePage - 1) * safeSize,
  });
  return store === prisma ? getCachedOrFetch(cacheKeys.audit(userId, safePage, safeSize), 7, read) : read();
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
