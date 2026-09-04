import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { appendAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
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
  const job = await store.job.findUnique({ where: { id: jobId } });
  if (!job || job.type !== "RECOVER")
    throw new AppError(404, "RECOVERY_JOB_NOT_FOUND", "Recovery job not found");
  return store.recoveredFile.create({
    data: {
      ...input,
      jobId,
      offsetStart: BigInt(input.offsetStart),
      offsetEnd: BigInt(input.offsetEnd),
      scoreBreakdown: input.scoreBreakdown as
        Prisma.InputJsonObject | undefined,
      validationNotes: input.validationNotes as
        Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listRecoveredFiles(
  jobId: string,
  userId: string,
  isAdmin: boolean,
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
    where: { jobId },
    orderBy: { offsetStart: "asc" },
  });
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
