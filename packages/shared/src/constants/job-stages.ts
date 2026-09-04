export const JOB_STAGES = [
  "QUEUED",
  "DEVICE_PROFILED",
  "WAITING_FOR_APPROVAL",
  "RUNNING",
  "OVERWRITING",
  "SANITIZING",
  "CARVING",
  "VALIDATING",
  "RECONSTRUCTING",
  "VERIFYING",
  "CERTIFYING",
  "COMPLETED",
  "FAILED",
] as const;

export type JobStage = (typeof JOB_STAGES)[number];
