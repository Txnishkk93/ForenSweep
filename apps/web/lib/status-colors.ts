import type {
  ApprovalStatus,
  ConfidenceLevel,
  JobStatus,
  RiskLevel,
} from "./types";

export type Tone = "neutral" | "destructive" | "warning" | "success" | "recovery" | "info";

export const toneClasses: Record<Tone, { bg: string; text: string; border: string }> = {
  neutral: { bg: "bg-surface-strong", text: "text-ink", border: "border-hairline-strong" },
  destructive: { bg: "bg-destructive-soft", text: "text-destructive-active", border: "border-destructive/30" },
  warning: { bg: "bg-warning-soft", text: "text-warning", border: "border-warning/30" },
  success: { bg: "bg-success-soft", text: "text-success", border: "border-success/30" },
  recovery: { bg: "bg-recovery-soft", text: "text-recovery", border: "border-recovery/30" },
  info: { bg: "bg-primary-soft", text: "text-primary-active", border: "border-primary/30" },
};

export function jobStatusTone(status: JobStatus): Tone {
  switch (status) {
    case "QUEUED":
      return "neutral";
    case "RUNNING":
    case "VERIFYING":
      return "info";
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "destructive";
    case "CANCELLED":
      return "neutral";
  }
}

export function jobStatusLabel(status: JobStatus): string {
  switch (status) {
    case "QUEUED":
      return "Queued";
    case "RUNNING":
      return "Running";
    case "VERIFYING":
      return "Verifying";
    case "COMPLETED":
      return "Completed";
    case "FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled";
  }
}

export function eraseMethodLabel(method: string): string {
  switch (method) {
    case "DESTROY":
      return "Physical destruction required";
    case "OVERWRITE_SINGLE":
      return "Single-pass overwrite";
    case "OVERWRITE_MULTI":
      return "Multi-pass overwrite";
    case "ATA_SECURE_ERASE":
      return "ATA Secure Erase";
    case "NVME_SECURE_FORMAT":
      return "NVMe Secure Format";
    case "CRYPTO_ERASE":
      return "Cryptographic Erase";
    case "FILE_LEVEL_OVERWRITE":
      return "File-level overwrite";
    default:
      return method.replaceAll("_", " ");
  }
}

export function confidenceTone(level: ConfidenceLevel): Tone {
  if (level === "HIGH") return "success";
  if (level === "MEDIUM") return "warning";
  return "neutral"; // LOW confidence is not a danger state — never destructive-red
}

export function riskTone(level: RiskLevel | null): Tone {
  if (level === "LOW") return "success";
  if (level === "MEDIUM") return "warning";
  if (level === "HIGH") return "destructive";
  return "neutral";
}

export function approvalTone(status: ApprovalStatus | undefined): Tone {
  switch (status) {
    case "PENDING":
      return "warning";
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "destructive";
    default:
      return "neutral";
  }
}

export function approvalLabel(status: ApprovalStatus | undefined): string {
  switch (status) {
    case "PENDING":
      return "Pending approval";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    default:
      return "Not required";
  }
}

/** Formats a BigInt-as-string byte count into a human-readable size. */
export function formatBytes(bytes: string | null | undefined): string {
  if (!bytes) return "—";
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
