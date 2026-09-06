import { apiFetch } from "./api-client";
import type {
  AuditEvent,
  Certificate,
  Device,
  EraseMethod,
  Job,
  RecoveredFile,
  SanitizationPlan,
} from "./types";

type DeviceProfileResponse = Device & {
  recommendedMethod?: EraseMethod;
  sanitizationLabel?: string;
  warnings?: string[];
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  requiresApproval?: boolean;
  allowedInSimulationMode?: boolean;
};

type RawAuditEvent = {
  id: string;
  userId?: string | null;
  jobId?: string | null;
  action: string;
  detail: unknown;
  previousHash?: string | null;
  prevEventHash?: string | null;
  eventHash: string;
  timestamp: string;
};

export async function getDevices(): Promise<Device[]> {
  return apiFetch<Device[]>("/api/devices");
}

export async function getDevice(deviceId: string): Promise<Device> {
  return apiFetch<Device>(`/api/devices/${deviceId}`);
}

export async function getDeviceProfile(deviceId: string): Promise<DeviceProfileResponse> {
  return apiFetch<DeviceProfileResponse>(`/api/devices/${deviceId}/profile`);
}

export function profileToPlan(profile: DeviceProfileResponse): SanitizationPlan {
  const purgeMethods: EraseMethod[] = [
    "ATA_SECURE_ERASE",
    "NVME_SECURE_FORMAT",
    "CRYPTO_ERASE",
  ];
  return {
    method: profile.recommendedMethod ?? "OVERWRITE_MULTI",
    nistCategory: purgeMethods.includes(profile.recommendedMethod ?? "OVERWRITE_MULTI")
      ? "PURGE"
      : "CLEAR",
    justification:
      profile.sanitizationLabel ??
      "The backend selected the safest available sanitization method for this device.",
    limitations: profile.warnings?.join(" ") || null,
  };
}

export async function getJobs(): Promise<Job[]> {
  return apiFetch<Job[]>("/api/jobs");
}

export async function getJob(jobId: string): Promise<Job> {
  return apiFetch<Job>(`/api/jobs/${jobId}`);
}

export async function approveJob(jobId: string): Promise<Job> {
  return apiFetch<Job>(`/api/jobs/${jobId}/approve`, { method: "POST" });
}

export async function createEraseJob(input: {
  deviceId: string;
  eraseScope: "WHOLE_DRIVE" | "SPECIFIC_FILES";
  requestedMethod?: EraseMethod;
  standard?: "NIST_800_88" | "DOD_5220_22_M";
  typeToConfirm: string;
  eraseFileList?: string[];
}): Promise<Job> {
  return apiFetch<Job>("/api/jobs/erase", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createRecoveryJob(input: {
  deviceId?: string;
  imageId?: string;
  scanType: "QUICK" | "DEEP";
}): Promise<Job> {
  return apiFetch<Job>("/api/jobs/recover", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getRecoveredFiles(jobId: string): Promise<RecoveredFile[]> {
  return apiFetch<RecoveredFile[]>(`/api/jobs/${jobId}/recovered-files`);
}

export async function exportRecoveredFile(fileId: string): Promise<unknown> {
  return apiFetch(`/api/recovered-files/${fileId}/export`, { method: "POST" });
}

export async function getCertificateForJob(jobId: string): Promise<Certificate> {
  return apiFetch<Certificate>(`/api/jobs/${jobId}/certificate`);
}

export async function getCertificate(certificateId: string): Promise<Certificate> {
  return apiFetch<Certificate>(`/api/certificates/${certificateId}`);
}

export async function verifyCertificate(certificate: Certificate): Promise<{ valid: boolean }> {
  const payload = (certificate as Certificate & { canonicalPayload?: unknown }).canonicalPayload;
  if (!payload) throw new Error("This certificate does not contain a verifiable payload.");
  return apiFetch<{ valid: boolean }>("/api/certificates/verify", {
    method: "POST",
    body: JSON.stringify({
      payload,
      contentHash: certificate.contentHash,
      signature: certificate.signature,
    }),
  });
}

export async function getCertificatesFromJobs(jobs: Job[]): Promise<Certificate[]> {
  const certificates = await Promise.all(
    jobs
      .filter((job) => job.type === "ERASE" && job.status === "COMPLETED")
      .map((job) => getCertificateForJob(job.id).catch(() => null)),
  );
  return certificates.filter((certificate): certificate is Certificate => certificate !== null);
}

export async function getJobAudit(jobId: string): Promise<AuditEvent[]> {
  const events = await apiFetch<RawAuditEvent[]>(`/api/jobs/${jobId}/audit`);
  return events.map((event) => ({
    id: event.id,
    jobId: event.jobId,
    userId: event.userId,
    actorName: event.userId,
    eventType: event.action,
    payload: JSON.stringify(event.detail ?? {}),
    eventHash: event.eventHash,
    prevEventHash: event.previousHash ?? event.prevEventHash ?? null,
    timestamp: event.timestamp,
  }));
}

export async function getAuditFromJobs(jobs: Job[]): Promise<AuditEvent[]> {
  const audits = await Promise.all(jobs.map((job) => getJobAudit(job.id).catch(() => [])));
  return audits.flat().sort((left, right) =>
    right.timestamp.localeCompare(left.timestamp),
  );
}
