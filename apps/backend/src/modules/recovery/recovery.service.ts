import type { Prisma, $Enums } from "@prisma/client";
import { copyFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { appendAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import { env } from "../../config/env.js";
import type { recoveredFileSchema } from "./recovery.schemas.js";

export type RecoveryStore = Pick<
  typeof prisma,
  "job" | "recoveredFile" | "auditLog"
>;
export async function ingestRecoveredFile(
  jobId: string,
  input: z.infer<typeof recoveredFileSchema>,
  store: RecoveryStore = prisma,
) {
  console.info(JSON.stringify({
    message: "recovered_file_received",
    jobId,
    fileName: input.fileName,
    fileType: input.fileType,
    confidenceLevel: input.confidenceLevel,
  }));
  const job = await store.job.findUnique({ where: { id: jobId } });
  if (!job || job.type !== "RECOVER")
    throw new AppError(404, "RECOVERY_JOB_NOT_FOUND", "Recovery job not found");
  const safeRoot = resolve(env.SAFE_OUTPUT_ROOT);
  const storedPath = resolve(input.storedPath);
  if (
    !storedPath.startsWith(safeRoot + "\\") &&
    !storedPath.startsWith(safeRoot + "/")
  )
    throw new AppError(
      409,
      "UNSAFE_ARTIFACT_PATH",
      "Recovered artifact is outside the controlled output root",
    );
  const previewPath = input.previewPath
    ? resolve(input.previewPath)
    : undefined;
  if (
    previewPath &&
    !previewPath.startsWith(safeRoot + "\\") &&
    !previewPath.startsWith(safeRoot + "/")
  )
    throw new AppError(
      409,
      "UNSAFE_PREVIEW_PATH",
      "Recovered preview is outside the controlled output root",
    );
  const {
    fileName,
    fileType,
    mimeType,
    offsetStart,
    offsetEnd,
    isFragmented,
    isTruncated,
    fragmentCount,
    confidenceScore,
    confidenceLevel,
    scoreBreakdown,
    validationNotes,
    sha256,
    previewPath: _previewPath,
    storedPath: _storedPath,
    previewAvailable: _previewAvailable,
    fragmentationStatus: _fragmentationStatus,
  } = input;
  return store.recoveredFile.create({
    data: {
      jobId,
      fileName,
      fileType,
      mimeType,
      offsetStart: BigInt(offsetStart),
      offsetEnd: BigInt(offsetEnd),
      isFragmented,
      isTruncated,
      fragmentCount,
      confidenceScore,
      confidenceLevel,
      scoreBreakdown: scoreBreakdown as Prisma.InputJsonObject | undefined,
      validationNotes: validationNotes as Prisma.InputJsonValue | undefined,
      sha256,
      storedPath,
      previewPath,
    },
  });
}

export async function listRecoveredFiles(
  jobId: string,
  userId: string,
  isAdmin: boolean,
  filters: {
    fileType?: string;
    confidenceLevel?: $Enums.ConfidenceLevel;
    truncated?: boolean;
    fragmented?: boolean;
  } = {},
  store: RecoveryStore = prisma,
) {
  const job = await store.job.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError(404, "JOB_NOT_FOUND", "Job not found");
  if (!isAdmin && job.userId !== userId)
    throw new AppError(
      403,
      "FORBIDDEN",
      "You do not have permission to access this job",
    );
  return store.recoveredFile.findMany({
    where: {
      jobId,
      ...(filters.fileType ? { fileType: filters.fileType } : {}),
      ...(filters.confidenceLevel
        ? { confidenceLevel: filters.confidenceLevel }
        : {}),
      ...(filters.truncated === undefined
        ? {}
        : { isTruncated: filters.truncated }),
      ...(filters.fragmented === undefined
        ? {}
        : { isFragmented: filters.fragmented }),
    },
    orderBy: { offsetStart: "asc" },
  });
}

export async function exportRecoveredFile(
  id: string,
  userId: string,
  isAdmin: boolean,
  outputRoot: string,
  store: RecoveryStore = prisma,
) {
  const file = await store.recoveredFile.findUnique({ where: { id } });
  if (!file)
    throw new AppError(
      404,
      "RECOVERED_FILE_NOT_FOUND",
      "Recovered file not found",
    );
  const job = await store.job.findUnique({ where: { id: file.jobId } });
  if (!job || (!isAdmin && job.userId !== userId))
    throw new AppError(
      403,
      "FORBIDDEN",
      "You do not have permission to export this file",
    );
  const source = resolve(file.storedPath);
  const root = resolve(outputRoot);
  if (!source.startsWith(root + "\\") && !source.startsWith(root + "/"))
    throw new AppError(
      409,
      "UNSAFE_ARTIFACT_PATH",
      "Recovered artifact is outside the controlled output root",
    );
  const targetDir = resolve(root, "exports", job.id);
  const target = resolve(
    targetDir,
    `${file.id}-${basename(file.fileName ?? "recovered-file")}`,
  );
  if (
    !target.startsWith(targetDir + "\\") &&
    !target.startsWith(targetDir + "/")
  )
    throw new AppError(
      400,
      "INVALID_FILENAME",
      "Recovered filename is invalid",
    );
  await (
    await import("node:fs/promises")
  ).mkdir(targetDir, { recursive: true });
  await copyFile(source, target);
  await appendAuditEvent(store, {
    userId,
    jobId: job.id,
    action: "FILE_EXPORTED",
    detail: { fileId: file.id, jobId: job.id, exported: true },
  });
  return {
    fileId: file.id,
    jobId: job.id,
    exportPath: target,
    sizeBytes: String((await stat(target)).size),
  };
}

export async function getRecoveredArtifact(
  id: string,
  userId: string,
  isAdmin: boolean,
  outputRoot: string,
  store: RecoveryStore = prisma,
) {
  const file = await store.recoveredFile.findUnique({ where: { id } });
  if (!file)
    throw new AppError(
      404,
      "RECOVERED_FILE_NOT_FOUND",
      "Recovered file not found",
    );
  const job = await store.job.findUnique({ where: { id: file.jobId } });
  if (!job || (!isAdmin && job.userId !== userId))
    throw new AppError(
      403,
      "FORBIDDEN",
      "You do not have permission to access this file",
    );
  const source = resolve(file.storedPath);
  const root = resolve(outputRoot);
  if (!source.startsWith(root + "\\") && !source.startsWith(root + "/"))
    throw new AppError(
      409,
      "UNSAFE_ARTIFACT_PATH",
      "Recovered artifact is outside the controlled output root",
    );
  return {
    path: source,
    fileName: file.fileName ?? basename(source),
    mimeType: file.mimeType ?? "application/octet-stream",
  };
}

export async function auditRecovery(
  jobId: string,
  action: string,
  userId: string,
  detail: Prisma.InputJsonObject,
  store: RecoveryStore = prisma,
) {
  return appendAuditEvent(store, { jobId, userId, action, detail });
}
