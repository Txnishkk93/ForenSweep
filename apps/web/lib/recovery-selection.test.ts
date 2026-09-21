import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveRecoverySelection } from "./recovery-selection.js";

describe("resolveRecoverySelection", () => {
  test("prefers an explicit archiveId and keeps the matching certificate selected", () => {
    const images = [
      { id: "archive-index", filename: "index.js.forensic.zip", sizeBytes: "1024", createdAt: "2026-09-16T00:00:00.000Z", format: "FORENSWEEP_FORENSIC_ARCHIVE" as const },
      { id: "archive-rust", filename: "blockchain-rust.forensic.zip", sizeBytes: "2048", createdAt: "2026-09-16T00:00:00.000Z", format: "FORENSWEEP_FORENSIC_ARCHIVE" as const },
    ];
    const certificates = [
      { id: "cert-index", targetDisplayName: "index.js", verificationResult: true, createdAt: "2026-09-16T00:00:00.000Z", jobId: "job-1", method: "FILE_LEVEL_OVERWRITE" as const, standard: "NIST_800_88" as const, contentHash: "hash-1", prevCertHash: null, signature: "sig-1", pdfPath: "" },
      { id: "cert-rust", targetDisplayName: "blockchain-rust", verificationResult: true, createdAt: "2026-09-16T00:00:00.000Z", jobId: "job-2", method: "FILE_LEVEL_OVERWRITE" as const, standard: "NIST_800_88" as const, contentHash: "hash-2", prevCertHash: null, signature: "sig-2", pdfPath: "" },
    ];

    const selection = resolveRecoverySelection({
      images,
      certificates,
      searchParams: { archiveId: "archive-rust", certificateId: "cert-rust" },
    });

    assert.equal(selection.acquisitionId, "archive-rust");
    assert.equal(selection.authorizationCertificateId, "cert-rust");
  });

  test("infers the target archive from a certificate when only the certificate was clicked", () => {
    const images = [
      { id: "archive-index", filename: "index.js.forensic.zip", sizeBytes: "1024", createdAt: "2026-09-16T00:00:00.000Z", format: "FORENSWEEP_FORENSIC_ARCHIVE" as const },
      { id: "archive-rust", filename: "blockchain-rust.forensic.zip", sizeBytes: "2048", createdAt: "2026-09-16T00:00:00.000Z", format: "FORENSWEEP_FORENSIC_ARCHIVE" as const },
    ];
    const certificates = [
      { id: "cert-index", targetDisplayName: "index.js", verificationResult: true, createdAt: "2026-09-16T00:00:00.000Z", jobId: "job-1", method: "FILE_LEVEL_OVERWRITE" as const, standard: "NIST_800_88" as const, contentHash: "hash-1", prevCertHash: null, signature: "sig-1", pdfPath: "" },
      { id: "cert-rust", targetDisplayName: "blockchain-rust", verificationResult: true, createdAt: "2026-09-16T00:00:00.000Z", jobId: "job-2", method: "FILE_LEVEL_OVERWRITE" as const, standard: "NIST_800_88" as const, contentHash: "hash-2", prevCertHash: null, signature: "sig-2", pdfPath: "" },
    ];

    const selection = resolveRecoverySelection({
      images,
      certificates,
      searchParams: { certificateId: "cert-rust" },
    });

    assert.equal(selection.acquisitionId, "archive-rust");
    assert.equal(selection.authorizationCertificateId, "cert-rust");
  });

  test("keeps the archive picker empty when navigation is direct and no selected archive is provided", () => {
    const images = [
      { id: "archive-index", filename: "index.js.forensic.zip", sizeBytes: "1024", createdAt: "2026-09-16T00:00:00.000Z", format: "FORENSWEEP_FORENSIC_ARCHIVE" as const },
      { id: "archive-rust", filename: "blockchain-rust.forensic.zip", sizeBytes: "2048", createdAt: "2026-09-16T00:00:00.000Z", format: "FORENSWEEP_FORENSIC_ARCHIVE" as const },
    ];
    const certificates = [
      { id: "cert-index", targetDisplayName: "index.js", verificationResult: true, createdAt: "2026-09-16T00:00:00.000Z", jobId: "job-1", method: "FILE_LEVEL_OVERWRITE" as const, standard: "NIST_800_88" as const, contentHash: "hash-1", prevCertHash: null, signature: "sig-1", pdfPath: "" },
      { id: "cert-rust", targetDisplayName: "blockchain-rust", verificationResult: true, createdAt: "2026-09-16T00:00:00.000Z", jobId: "job-2", method: "FILE_LEVEL_OVERWRITE" as const, standard: "NIST_800_88" as const, contentHash: "hash-2", prevCertHash: null, signature: "sig-2", pdfPath: "" },
    ];

    const selection = resolveRecoverySelection({
      images,
      certificates,
      searchParams: {},
    });

    assert.equal(selection.acquisitionId, "");
    assert.equal(selection.authorizationCertificateId, "");
  });
});
