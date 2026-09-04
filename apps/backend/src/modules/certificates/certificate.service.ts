import { readFile } from "node:fs/promises";
import { verify } from "node:crypto";
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

export type CertificateStore = Pick<
  typeof prisma,
  "certificate" | "job" | "auditLog"
>;
type CertificateInput = z.infer<typeof internalCertificateSchema>;

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
  const certificate = await store.certificate.findUnique({ where: { id } });
  if (!certificate)
    throw new AppError(404, "CERTIFICATE_NOT_FOUND", "Certificate not found");
  const job = await store.job.findUnique({ where: { id: certificate.jobId } });
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
  return certificate;
}

export async function verifyCertificate(
  input: z.infer<typeof verifyCertificateSchema>,
  userId: string,
  store: CertificateStore = prisma,
) {
  const computedHash = sha256(input.payload);
  let signatureValid = false;
  try {
    const publicKey = await readFile(env.CERT_PUBLIC_KEY_PATH);
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
