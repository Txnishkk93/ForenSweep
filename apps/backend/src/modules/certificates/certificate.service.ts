import { readFile } from "node:fs/promises";
import { verify } from "node:crypto";
import { fileURLToPath } from "node:url";
import { canonicalJson, sha256 } from "@repo/crypto";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { appendAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import { env } from "../../config/env.js";
import type {
  internalCertificateSchema,
  verifyCertificateSchema,
} from "./certificate.schemas.js";
import { cacheKeys, getCachedOrFetch } from "../../lib/cache.js";
import path from "node:path";
import { resolveAvailableImage } from "../acquisitions/acquisition.service.js";

export type CertificateStore = Pick<
  typeof prisma,
  "certificate" | "job" | "auditLog"
>;
type CertificateInput = z.infer<typeof internalCertificateSchema>;

type CertificateRecord = NonNullable<
  Awaited<ReturnType<typeof prisma.certificate.findUnique>>
>;
type CertificateWithDisplayData = CertificateRecord & {
  sanitizationTier: string | null;
  targetDisplayName: string;
  targetPaths: string[];
  targetDeviceId: string | null;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function certificateDisplayData(
  certificate: CertificateRecord & { job?: unknown },
  job: {
    type: string;
    eraseScope: string | null;
    eraseFileList: unknown;
    device: { id: string; model: string | null; path: string } | null;
  } | null,
): CertificateWithDisplayData {
  const payload = (certificate.canonicalPayload ?? {}) as Record<string, unknown>;
  const payloadPaths = stringArray(payload.targetPaths);
  const jobPaths = stringArray(job?.eraseFileList);
  const targetPaths = payloadPaths.length > 0 ? payloadPaths : jobPaths;
  const names = targetPaths.map((target) => path.basename(target.replaceAll("\\", "/")) || target);
  const payloadName = typeof payload.targetDisplayName === "string" ? payload.targetDisplayName : "";
  const targetDisplayName = payloadName.length > 0 && payloadName !== "Selected files and folders"
    ? payloadName
    : names.length === 1
      ? (names[0] ?? "Selected item")
      : names.length > 1
        ? names.length <= 3
          ? names.join(" + ")
          : `${names.length} selected items`
        : job?.device?.model || (job?.type === "RECOVER" ? "Recovered files" : "Managed device");
  const { job: _job, ...certificateData } = certificate;
  return {
    ...certificateData,
    sanitizationTier: typeof payload.sanitizationTier === "string" ? payload.sanitizationTier : null,
    targetDisplayName,
    targetPaths,
    targetDeviceId: job?.device?.id ?? null,
  };
}

export async function persistCertificate(
  input: CertificateInput,
  store: CertificateStore = prisma,
) {
  if (!input.payload.verificationResult)
    throw new AppError(
      409,
      "CERTIFICATE_REQUIRES_VERIFICATION",
      "Certificates require verified completion",
    );
  if (sha256(input.payload) !== input.contentHash)
    throw new AppError(
      400,
      "CERTIFICATE_HASH_INVALID",
      "Certificate content hash is invalid",
    );
  const job = await store.job.findUnique({
    where: { id: input.payload.jobId },
  });
  if (!job) throw new AppError(404, "JOB_NOT_FOUND", "Job not found");
  if (job.status !== "COMPLETED" || !job.verified)
    throw new AppError(
      409,
      "JOB_NOT_VERIFIED",
      "Certificates require a verified completed job",
    );
  const previous = await store.certificate.findFirst({
    orderBy: { createdAt: "desc" },
    select: { contentHash: true },
  });
  const certificate = await store.certificate.create({
    data: {
      certificateNumber: input.payload.certificateNumber,
      jobId: input.payload.jobId,
      method: input.payload.method as never,
      standard: input.payload.standard as never,
      verificationResult: input.payload.verificationResult,
      verificationDetails: input.payload
        .verificationDetail as Prisma.InputJsonObject,
      deviceSnapshot: input.payload.deviceSnapshot as Prisma.InputJsonObject,
      canonicalPayload: input.payload as Prisma.InputJsonObject,
      contentHash: input.contentHash,
      hashAlgorithm: input.hashAlgorithm,
      signatureAlgorithm: input.signatureAlgorithm,
      prevCertHash: previous?.contentHash,
      signature: input.signature,
      pdfPath: input.pdfPath,
    },
  });
  await appendAuditEvent(store, {
    userId: job.userId,
    jobId: job.id,
    action: "CERTIFICATE_GENERATED",
    detail: {
      certificateId: certificate.id,
      certificateNumber: certificate.certificateNumber,
    },
  });
  return certificate;
}

export async function getCertificateForUser(
  id: string,
  userId: string,
  isAdmin: boolean,
  store: CertificateStore = prisma,
) {
  const certificate = await store.certificate.findUnique({
    where: { id },
    include: { job: { include: { device: true } } },
  });
  if (!certificate)
    throw new AppError(404, "CERTIFICATE_NOT_FOUND", "Certificate not found");
  const job = certificate.job;
  if (!job || (!isAdmin && job.userId !== userId))
    throw new AppError(
      403,
      "FORBIDDEN",
      "You do not have permission to access this certificate",
    );
  await appendAuditEvent(store, {
    userId,
    jobId: job.id,
    action: "CERTIFICATE_VIEWED",
    detail: { certificateId: certificate.id },
  });
  return certificateDisplayData(certificate, job);
}

export async function getCertificateForDownload(
  id: string,
  store: CertificateStore = prisma,
) {
  const certificate = await store.certificate.findUnique({
    where: { id },
    include: { job: { include: { device: true } } },
  });
  if (!certificate)
    throw new AppError(404, "CERTIFICATE_NOT_FOUND", "Certificate not found");
  return certificateDisplayData(certificate, certificate.job);
}

export async function listCertificates(
  userId: string,
  isAdmin: boolean,
  page = 1,
  pageSize = 50,
  store: CertificateStore = prisma,
) {
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.min(50, Math.max(1, Math.floor(pageSize)));
  const read = async () => {
    const certificates = await store.certificate.findMany({
      where: isAdmin ? undefined : { job: { userId } },
      orderBy: { createdAt: "desc" },
      take: safeSize,
      skip: (safePage - 1) * safeSize,
      include: { job: { include: { device: true } } },
    });
    return certificates.map((certificate) =>
      certificateDisplayData(certificate, certificate.job),
    );
  };
  return store === prisma
    ? getCachedOrFetch(cacheKeys.certificates(userId, safePage, safeSize), 12, read)
    : read();
}

export async function listCertificatesForTarget(
  deviceId: string | undefined,
  targetPath: string | undefined,
  userId: string,
  isAdmin: boolean,
  store: CertificateStore = prisma,
) {
  const certificates = await store.certificate.findMany({
    where: {
      verificationResult: true,
      job: {
        status: "COMPLETED",
        verified: true,
        ...(isAdmin ? undefined : { userId }),
        ...(deviceId ? { deviceId } : {}),
      },
    },
    include: { job: { include: { device: true } } },
    orderBy: { createdAt: "desc" },
  });
  return certificates
    .filter((certificate) => {
      if (!targetPath) return true;
      const payload = (certificate.canonicalPayload ?? {}) as Record<string, unknown>;
      const paths = stringArray(payload.targetPaths);
      const jobPaths = stringArray(certificate.job.eraseFileList);
      return [
        certificate.job.sourceImagePath,
        certificate.job.device?.path,
        ...paths,
        ...jobPaths,
      ].some((value) => value === targetPath);
    })
    .map((certificate) => certificateDisplayData(certificate, certificate.job));
}

export async function verifyCertificate(
  input: z.infer<typeof verifyCertificateSchema>,
  userId: string,
  store: CertificateStore = prisma,
) {
  const computedHash = sha256(input.payload);
  let signatureValid = false;
  try {
    let publicKey: Buffer;
    try {
      publicKey = await readFile(env.CERT_PUBLIC_KEY_PATH);
    } catch {
      publicKey = await readFile(
        fileURLToPath(
          new URL("../../../secrets/forensweep-ed25519-public.pem", import.meta.url),
        ),
      );
    }
    signatureValid = verify(
      null,
      Buffer.from(input.contentHash),
      publicKey,
      Buffer.from(input.signature, "base64"),
    );
  } catch {
    signatureValid = false;
  }
  const hashValid = computedHash === input.contentHash;
  const valid = hashValid && signatureValid;
  await appendAuditEvent(store, {
    userId,
    jobId: input.payload.jobId,
    action: "CERTIFICATE_VERIFIED",
    detail: {
      valid,
      hashValid,
      signatureValid,
      certificateNumber: input.payload.certificateNumber,
    },
  });
  return {
    valid,
    hashValid,
    signatureValid,
    reason: valid
      ? "Certificate payload hash and Ed25519 signature are valid"
      : !hashValid
        ? "Certificate payload hash does not match contentHash"
        : "Ed25519 signature is invalid or public key is unavailable",
  };
}

export async function authorizeRecoveryCertificate(
  input: z.infer<typeof import("./certificate.schemas.js").authorizeRecoveryCertificateSchema>,
  userId: string,
  store: CertificateStore = prisma,
) {
  const verification = await verifyCertificate(input.certificate, userId, store);
  if (!verification.valid) {
    await auditRecoveryUpload(
      {
        outcome: "INVALID",
        target: input.target,
        reason: verification.signatureValid ? "CERTIFICATE_HASH_INVALID" : "CERTIFICATE_SIGNATURE_INVALID",
      },
      userId,
      store,
    );
    return { state: verification.signatureValid ? "INVALID" : "INVALID", verification } as const;
  }
  const sourcePath = input.target.imageId
    ? await resolveAvailableImage(input.target.imageId)
    : undefined;
  const originatingJob = await store.job.findUnique({
    where: { id: input.certificate.payload.jobId },
    include: { device: true },
  });
  if (!originatingJob || originatingJob.type !== "ERASE" || originatingJob.status !== "COMPLETED" || !originatingJob.verified) {
    await auditRecoveryUpload(
      { outcome: "MISMATCHED", target: input.target, reason: "CERTIFICATE_TARGET_MISMATCH" },
      userId,
      store,
    );
    return { state: "MISMATCHED", verification } as const;
  }
  const payload = input.certificate.payload as Record<string, unknown>;
  const deviceMatches = input.target.deviceId !== undefined
    && originatingJob.deviceId === input.target.deviceId;
  const imageMatches = sourcePath !== undefined
    && (originatingJob.sourceImagePath === sourcePath
      || (payload.deviceSnapshot as Record<string, unknown> | undefined)?.path === sourcePath);
  const matches = Boolean(originatingJob && (deviceMatches || imageMatches));
  if (!matches) {
    await auditRecoveryUpload(
      { outcome: "MISMATCHED", target: input.target, reason: "CERTIFICATE_TARGET_MISMATCH" },
      userId,
      store,
    );
    return { state: "MISMATCHED", verification } as const;
  }
  const localCertificate = await store.certificate.findUnique({
    where: { jobId: originatingJob.id },
    include: { job: { include: { device: true } } },
  });
  await auditRecoveryUpload(
    { outcome: "VALID", certificateId: localCertificate?.id ?? null, target: input.target },
    userId,
    store,
  );
  return {
    state: "VALID",
    verification,
    certificateId: localCertificate?.id,
    targetDisplayName: localCertificate
      ? certificateDisplayData(localCertificate, localCertificate.job).targetDisplayName
      : typeof payload.targetDisplayName === "string" ? payload.targetDisplayName : "Sanitized target",
    issuedAt: originatingJob.finishedAt?.toISOString() ?? originatingJob.createdAt.toISOString(),
  } as const;
}

export async function auditRecoveryUpload(
  input: z.infer<typeof import("./certificate.schemas.js").recoveryUploadAuditSchema>,
  userId: string,
  store: CertificateStore = prisma,
) {
  return appendAuditEvent(store, {
    userId,
    action: "RECOVERY_CERTIFICATE_UPLOAD",
    detail: {
      outcome: input.outcome,
      certificateId: input.certificateId ?? null,
      target: input.target as Prisma.InputJsonObject,
      reason: input.reason ?? null,
    },
  });
}
