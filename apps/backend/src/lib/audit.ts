import { sha256 } from "@repo/crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type AuditStore = Pick<typeof prisma, "auditLog">;

export async function appendAuditEvent(
  store: AuditStore,
  input: {
    userId?: string;
    jobId?: string;
    action: string;
    detail: Prisma.InputJsonObject;
    timestamp?: Date;
  },
) {
  const timestamp = input.timestamp ?? new Date();
  const previous = await store.auditLog.findFirst({
    orderBy: { timestamp: "desc" },
    select: { eventHash: true },
  });
  const previousHash = previous?.eventHash;
  const eventHash = sha256({
    userId: input.userId ?? null,
    jobId: input.jobId ?? null,
    action: input.action,
    detail: input.detail,
    timestamp: timestamp.toISOString(),
    previousHash: previousHash ?? null,
  });
  return store.auditLog.create({
    data: {
      userId: input.userId,
      jobId: input.jobId,
      action: input.action,
      detail: input.detail,
      timestamp,
      previousHash,
      eventHash,
    },
  });
}
