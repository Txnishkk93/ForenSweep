// These types mirror packages/shared exactly. When wiring this into the real
// monorepo, delete this file and import from "@sih/shared" / "@repo/shared"
// instead — do not maintain two copies.

export type Role = "ADMIN" | "OPERATOR" | "INVESTIGATOR";
export type JobType = "ERASE" | "RECOVER";
export type JobStatus = "QUEUED" | "RUNNING" | "VERIFYING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type DeviceType = "HDD" | "SSD" | "USB" | "SD_CARD" | "UNKNOWN";
export type EraseMethod =
  | "OVERWRITE_SINGLE"
  | "OVERWRITE_MULTI"
  | "ATA_SECURE_ERASE"
  | "NVME_SECURE_FORMAT"
  | "CRYPTO_ERASE"
  | "FILE_LEVEL_OVERWRITE";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type ApprovalStatus = "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
export type NistCategory = "CLEAR" | "PURGE" | "DESTROY";

export interface Device {
  id: string;
  path: string;
  type: DeviceType;
  model: string | null;
  serial: string | null;
  sizeBytes: string | null; // BigInt serialized as string
  mounted?: boolean;
  isSystemDisk?: boolean;
  supportsAta: boolean;
  supportsNvme: boolean;
  supportsSed: boolean;
}

export interface DeviceFsEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  sizeBytes: string | null;
  modifiedAt: string | null;
}

export interface DeviceBrowseResponse {
  currentPath: string;
  parentPath: string | null;
  entries: DeviceFsEntry[];
}

export interface FsEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  sizeBytes: string | null;
  modifiedAt: string | null;
  isSystemProtected?: boolean;
}

export interface FsBrowseResponse {
  currentPath: string | null;
  parentPath: string | null;
  entries: FsEntry[];
}

export interface AvailableImage {
  id: string;
  filename: string;
  sizeBytes: string;
  createdAt: string;
}

export interface SanitizationPlan {
  method: EraseMethod;
  nistCategory: NistCategory;
  justification: string;
  limitations: string | null;
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  deviceId: string | null;
  device?: Device | null;
  eraseMethod: EraseMethod | null;
  approvalStatus?: ApprovalStatus;
  verified: boolean | null;
  residualRiskScore: number | null;
  residualRiskLevel: RiskLevel | null;
  errorMessage: string | null;
  certificate?: Certificate | null;
  createdAt: string;
}

export interface JobProgressEvent {
  jobId: string;
  status: JobStatus;
  progress: number;
  message?: string;
  currentPass?: string;
  sectorsVerified?: number;
  signaturesFound?: number;
  elapsedSeconds?: number;
  estimatedRemainingSeconds?: number;
}

export interface RecoveredFile {
  id: string;
  jobId: string;
  fileName: string | null;
  fileType: string;
  offsetStart: string;
  offsetEnd: string;
  isFragmented: boolean;
  isTruncated?: boolean;
  reconstructionMethod?: string | null;
  fragmentCount?: number;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  headerScore?: number;
  structureScore?: number;
  parserScore?: number;
  fragmentationScore?: number;
  reasons?: string[];
  storedPath: string;
}

export interface Certificate {
  id: string;
  jobId: string;
  method: EraseMethod;
  standard: string;
  verificationResult: boolean;
  targetDisplayName?: string;
  targetPaths?: string[];
  targetDeviceId?: string | null;
  canonicalPayload?: Record<string, unknown>;
  contentHash: string;
  prevCertHash: string | null;
  signature: string;
  pdfPath: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  jobId?: string | null;
  userId?: string | null;
  actorName?: string | null;
  eventType: string;
  payload: string; // JSON string
  eventHash: string;
  prevEventHash: string | null;
  timestamp: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  role: Role;
  createdAt?: string;
}
