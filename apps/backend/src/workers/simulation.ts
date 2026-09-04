import { Prisma, type $Enums } from "@prisma/client";
import { workerCompletionSchema, workerProgressSchema } from "@repo/shared";
import { appendAuditEvent } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { createLocalPublisher, type EventPublisher } from "../lib/publisher.js";

type SimulationStore = Pick<typeof prisma, "job" | "auditLog">;
const eraseStages = [
  "RUNNING",
  "OVERWRITING",
  "VERIFYING",
  "CERTIFYING",
  "COMPLETED",
] as const;
const recoverStages = [
  "RUNNING",
  "CARVING",
  "VALIDATING",
  "COMPLETED",
] as const;

export async function simulateJob(
  jobId: string,
  type: "ERASE" | "RECOVER",
  store: SimulationStore = prisma,
  publisher: EventPublisher = createLocalPublisher(() => undefined),
): Promise<void> {
  const job = await store.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Simulation job ${jobId} was not found`);
  const stages = type === "ERASE" ? eraseStages : recoverStages;
  const totalPasses = type === "ERASE" ? Math.max(job.totalPasses, 1) : 0;
  await appendAuditEvent(store, {
    userId: job.userId,
    jobId,
    action: "JOB_STARTED",
    detail: { type, simulated: true },
  });
  try {
    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index];
      if (!stage) continue;
      const progress = Math.round(((index + 1) / stages.length) * 100);
      const status: $Enums.JobStatus =
        stage === "COMPLETED"
          ? "COMPLETED"
          : stage === "VERIFYING"
            ? "VERIFYING"
            : "RUNNING";
      const prismaStage: $Enums.JobStage = stage;
      const updated = await store.job.update({
        where: { id: jobId },
        data: {
          status,
          stage: prismaStage,
          progress,
          currentPass: type === "ERASE" ? Math.min(index + 1, totalPasses) : 0,
          totalPasses,
          progressDetail: {
            simulated: true,
            message: `Simulation stage: ${stage}`,
          },
        },
      });
      const progressEvent = workerProgressSchema.parse({
        jobId,
        stage: prismaStage,
        progress,
        message: `Simulation stage: ${stage}`,
      });
      await publisher.publish({ type: "job:progress", payload: progressEvent });
      await publisher.publish({
        type: "job:status",
        payload: { jobId, status, stage: prismaStage, progress },
      });
      if (updated.status === "COMPLETED") {
        const completion = workerCompletionSchema.parse({
          jobId,
          success: true,
          verified: type === "ERASE",
          completedAt: new Date().toISOString(),
        });
        await appendAuditEvent(store, {
          userId: job.userId,
          jobId,
          action: "JOB_COMPLETED",
          detail: { type, simulated: true },
        });
        await publisher.publish({ type: "job:completed", payload: completion });
      }
    }
  } catch (error) {
    await store.job.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        stage: "FAILED",
        errorMessage: "Simulation failed",
        progressDetail: { simulated: true },
      },
    });
    await appendAuditEvent(store, {
      userId: job.userId,
      jobId,
      action: "JOB_FAILED",
      detail: {
        type,
        simulated: true,
        error: error instanceof Error ? error.message : "unknown",
      },
    });
    await publisher.publish({
      type: "job:failed",
      payload: {
        jobId,
        success: false,
        verified: false,
        completedAt: new Date().toISOString(),
        errorMessage: "Simulation failed",
      },
    });
    throw error;
  }
}
