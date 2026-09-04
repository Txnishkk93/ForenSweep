export const JOB_STAGES = [
  "QUEUED",
  "RUNNING",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
] as const;

export type JobStage = (typeof JOB_STAGES)[number];
