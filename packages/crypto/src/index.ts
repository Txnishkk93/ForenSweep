import { createHash } from "node:crypto";

export type CertificatePayload = {
  certificateId: string;
  jobId: string;
  method: string;
  standard: string;
  verificationResult: boolean;
  deviceSnapshot: Record<string, unknown>;
  contentHash: string;
  previousCertificateHash?: string;
  createdAt: string;
};

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

function normalize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
}
