"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { DataCard, SectionHeading, MonoText } from "@/components/Primitives";
import { ExpandableSection } from "@/components/ExpandableSection";
import { StatusBadge } from "@/components/StatusBadge";
import { authorizeRecoveryCertificate, auditRecoveryCertificateUpload, createRecoveryJob, getAvailableImages, getCertificates } from "@/lib/backend-api";
import { findArchiveForCertificate, resolveRecoverySelection } from "@/lib/recovery-selection";
import { formatBytes } from "@/lib/status-colors";
import type { Certificate } from "@/lib/types";

export default function NewRecoveryPage() {
  const router = useRouter();
  const [acquisitionId, setAcquisitionId] = useState("");
  const [scanType, setScanType] = useState<"quick" | "deep">("quick");
  const [submitting, setSubmitting] = useState(false);
  const { data: images = [], isLoading: loadingImages, error: imagesError } = useQuery({ queryKey: ["available-images"], queryFn: getAvailableImages });
  const { data: certificates = [] } = useQuery({ queryKey: ["certificates"], queryFn: getCertificates });
  const loadingSources = loadingImages;
  const sourceError = imagesError;
  const [error, setError] = useState<string | null>(null);
  const [authorizationCertificateId, setAuthorizationCertificateId] = useState("");
  const [uploadedCertificate, setUploadedCertificate] = useState<{ payload: Record<string, unknown>; contentHash: string; signature: string } | undefined>();
  const [certificateUploadState, setCertificateUploadState] = useState<"idle" | "dragging" | "parsing" | "valid" | "mismatched" | "invalid" | "unparseable">("idle");
  const [certificateUploadMessage, setCertificateUploadMessage] = useState<string | null>(null);
  const certificateInputRef = useRef<HTMLInputElement>(null);
  const forensicImages = images.filter((image) => image.format === "FORENSWEEP_FORENSIC_ARCHIVE" || image.filename.endsWith(".forensic.zip"));
  const blocked = false;
  const recoveryTarget = acquisitionId ? { imageId: acquisitionId } : {};
  const sanitizedCertificates = certificates.filter((certificate) => certificate.verificationResult);
  const acquisitionCount = forensicImages.length;
  const selectedAcquisition = forensicImages.find((image) => image.id === acquisitionId);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selection = resolveRecoverySelection({
      images,
      certificates,
      searchParams: Object.fromEntries(params.entries()),
    });
    if (selection.acquisitionId) setAcquisitionId(selection.acquisitionId);
    if (selection.authorizationCertificateId) setAuthorizationCertificateId(selection.authorizationCertificateId);
  }, [images, certificates]);

  useEffect(() => {
    if (!acquisitionId || !uploadedCertificate || certificateUploadState !== "idle") return;
    void verifyUploadedCertificate(uploadedCertificate);
  }, [acquisitionId, uploadedCertificate, certificateUploadState]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      if (!acquisitionId) throw new Error("Select an acquisition first.");
      const job = await createRecoveryJob({
        imageId: acquisitionId,
        scanType: scanType.toUpperCase() as "QUICK" | "DEEP",
        ...(authorizationCertificateId ? { certificateId: authorizationCertificateId } : {}),
        ...(uploadedCertificate ? { certificateVerification: uploadedCertificate } : {}),
      });
      router.push(`/recover/${job.id}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to start recovery.");
    } finally {
      setSubmitting(false);
    }
  }

  async function parseCertificateFile(file: File) {
    setCertificateUploadState("parsing");
    setCertificateUploadMessage(null);
    setUploadedCertificate(undefined);
    let parsed: { payload: Record<string, unknown>; contentHash: string; signature: string };
    try {
      if (file.name.toLowerCase().endsWith(".json")) {
        const exported = JSON.parse(await file.text()) as { data?: typeof parsed } & typeof parsed;
        parsed = exported.data ?? exported;
      } else if (file.name.toLowerCase().endsWith(".pdf")) {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@6.3.289/legacy/build/pdf.worker.min.mjs";
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const attachments = await pdf.getAttachments();
        const attachmentValues = (attachments instanceof Map ? [...attachments.values()] : Object.values(attachments ?? {})) as Array<{ filename?: string; content?: Uint8Array }>;
        const attachment = attachmentValues.find((item) => item.filename?.toLowerCase().endsWith(".json") && item.content);
        if (attachment?.content) {
          const exported = JSON.parse(new TextDecoder().decode(attachment.content)) as { data?: typeof parsed } & typeof parsed;
          parsed = exported.data ?? exported;
        } else {
          const metadata = await pdf.getMetadata();
          const info = (metadata.info ?? {}) as Record<string, unknown>;
          const subject = typeof info.Subject === "string" ? info.Subject : "";
          const encoded = subject.startsWith("ForenSweep-Certificate:") ? subject.slice("ForenSweep-Certificate:".length) : "";
          if (!encoded) throw new Error("This PDF does not contain an embedded certificate export. Download the JSON export from the certificate detail page and upload that file instead.");
          const normalizedEncoded = encoded.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
          const paddedEncoded = normalizedEncoded.padEnd(Math.ceil(normalizedEncoded.length / 4) * 4, "=");
          const exported = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(paddedEncoded), (character) => character.charCodeAt(0)))) as { data?: typeof parsed } & typeof parsed;
          parsed = exported.data ?? exported;
        }
      } else {
        throw new Error("Unsupported certificate file type.");
      }
      if (!parsed?.payload || typeof parsed.contentHash !== "string" || typeof parsed.signature !== "string") {
        throw new Error("The file does not contain a certificate export.");
      }
    } catch (uploadError) {
      setCertificateUploadState("unparseable");
      setCertificateUploadMessage(uploadError instanceof Error ? uploadError.message : "Unable to read this certificate export. Download the JSON export from the Certificates page and try again.");
      await auditRecoveryCertificateUpload({ outcome: "UNPARSEABLE", target: recoveryTarget, reason: uploadError instanceof Error ? uploadError.message : "parse_failed" }).catch(() => undefined);
      return;
    }
    setUploadedCertificate(parsed);
    if (!acquisitionId) {
      setCertificateUploadState("idle");
      setCertificateUploadMessage("Certificate loaded. Select the matching recovery source in the section above to verify it.");
      return;
    }
    await verifyUploadedCertificate(parsed);
  }

  async function verifyUploadedCertificate(certificate: { payload: Record<string, unknown>; contentHash: string; signature: string }) {
    setCertificateUploadState("parsing");
    setCertificateUploadMessage(null);
    try {
      const result = await authorizeRecoveryCertificate({ certificate, target: recoveryTarget });
      if (result.state === "VALID") {
        setCertificateUploadState("valid");
        setCertificateUploadMessage(`Certificate verified — ${result.targetDisplayName ?? "target"} sanitized on ${result.issuedAt ? new Date(result.issuedAt).toLocaleDateString() : "the recorded date"}.`);
      } else if (result.state === "MISMATCHED") {
        setCertificateUploadState("mismatched");
        setCertificateUploadMessage("This certificate is valid, but was issued for a different item — it can't authorize recovery of the current target.");
      } else {
        setCertificateUploadState("invalid");
        setCertificateUploadMessage("This file could not be verified as an authentic ForenSweep certificate — signature does not match.");
      }
    } catch (verificationError) {
      setCertificateUploadState("unparseable");
      setCertificateUploadMessage(verificationError instanceof Error ? verificationError.message : "Unable to verify this certificate against the selected recovery source.");
      await auditRecoveryCertificateUpload({ outcome: "UNPARSEABLE", target: recoveryTarget, reason: verificationError instanceof Error ? verificationError.message : "verification_failed" }).catch(() => undefined);
    }
  }

  function handleCertificateDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setCertificateUploadState((state) => state === "dragging" ? "idle" : state);
    const file = event.dataTransfer.files[0];
    if (file) void parseCertificateFile(file);
  }

  return (
    <div className="w-full max-w-5xl">
      <SectionHeading eyebrow="Forensic recovery" title="Recover deleted files" />

      <DataCard className="mb-4">
        <p className="mb-1 text-[15px] font-medium text-ink">Previously sanitized</p>
        <p className="mb-3 text-[13px] text-body-muted">
          These records authorize an attempt to scan the same target. A successful secure wipe is not reversible and may correctly produce no recoverable files.
        </p>
        {sanitizedCertificates.length ? (
          <ExpandableSection
            visibleCount={3}
            totalCount={sanitizedCertificates.length}
            renderListAction={(expanded) => (
              <div className="divide-y divide-hairline">
                {sanitizedCertificates.slice(0, expanded ? sanitizedCertificates.length : 3).map((certificate) => (
                  <div key={certificate.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-ink">{certificate.targetDisplayName ?? "Sanitized target"}</p>
                      <p className="text-[12px] text-body-muted">{certificate.method} · {certificate.standard} · {new Date(certificate.createdAt).toLocaleDateString()}</p>
                    </div>
                    {(() => {
                      const archive = findArchiveForCertificate(forensicImages, certificate);
                      const params = new URLSearchParams();
                      if (archive) params.set("archiveId", archive.id);
                      params.set("certificateId", certificate.id);
                      return (
                        <Link
                          href={`/recover/new?${params.toString()}`}
                          className="shrink-0 rounded border border-recovery px-3 py-1.5 text-[13px] font-medium text-recovery hover:bg-recovery-soft"
                        >
                          Recover
                        </Link>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          />
        ) : <p className="py-2 text-[13px] text-body-muted">No completed ForenSweep sanitizations found.</p>}
      </DataCard>

      <DataCard className="mb-4">
        <p className="mb-3 text-[15px] font-medium text-ink">
          Select a forensic archive
        </p>
        <p className="mb-3 text-[13px] text-body-muted">
          Recovery runs against the named forensic archive preserved before erasure. It contains the original files, paths, and hashes.
        </p>
        {selectedAcquisition && (
          <p className="mb-3 text-[12px] text-body-muted">Selected: <span className="font-medium text-ink">{selectedAcquisition.filename}</span></p>
        )}
        <div className="flex flex-col gap-2">
          {loadingSources && <p className="text-sm text-body-muted">Loading acquisitions...</p>}
          {!loadingSources && !forensicImages.length && !error && (
            <p className="text-sm text-body-muted">No preserved forensic archives found. Complete a file sanitization first.</p>
          )}
          <ExpandableSection
            visibleCount={3}
            totalCount={acquisitionCount}
            renderListAction={(expanded) => (
              <>
                {forensicImages.slice(0, expanded ? forensicImages.length : 3).map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => setAcquisitionId(image.id)}
                    className={"flex w-full items-center justify-between rounded border px-4 py-3 text-left transition-colors " + (acquisitionId === image.id ? "border-recovery bg-recovery-soft" : "border-hairline-strong hover:bg-canvas-soft")}
                  >
                    <div>
                      <p className="text-[14px] font-medium text-ink">{image.filename}</p>
                      <p className="mt-1 text-[12px] text-body-muted">{formatBytes(image.sizeBytes)}</p>
                    </div>
                    <StatusBadge label="Forensic archive" tone="success" />
                  </button>
                ))}
              </>
            )}
          />
        </div>
        {blocked && (
          <div className="mt-3 rounded border border-warning/30 bg-warning-soft p-3">
            <p className="text-[13px] text-warning">
              This acquisition&apos;s hash has not been verified yet. Recovery
              requires a verified forensic image to preserve chain of custody.
            </p>
          </div>
        )}
      </DataCard>

      <DataCard className="mb-4">
        <p className="mb-1 text-[15px] font-medium text-ink">Certificate authorization</p>
        <p className="mb-3 text-[13px] text-body-muted">
          Select the matching certificate for a previously sanitized target, or paste exported verification JSON. This authorizes a scan attempt; it does not reverse a wipe.
        </p>
        <select
          value={authorizationCertificateId}
          onChange={(event) => {
            const certificateId = event.target.value;
            setAuthorizationCertificateId(certificateId);
            setUploadedCertificate(undefined);
            setCertificateUploadState("idle");
            setCertificateUploadMessage(
              certificateId
                ? "Certificate selected. Choose a recovery source to verify it against this target."
                : null,
            );
          }}
          className="w-full rounded border border-hairline-strong bg-surface-card px-3 py-2 text-sm text-ink"
        >
          <option value="">No certificate selected</option>
          {certificates.map((certificate: Certificate) => (
            <option key={certificate.id} value={certificate.id}>
              {certificate.targetDisplayName ?? "Sanitized target"} · {new Date(certificate.createdAt).toLocaleDateString()}
            </option>
          ))}
        </select>
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload certificate JSON or PDF"
          onClick={() => certificateInputRef.current?.click()}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") certificateInputRef.current?.click(); }}
          onDragEnter={(event) => { event.preventDefault(); setCertificateUploadState("dragging"); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setCertificateUploadState((state) => state === "dragging" ? "idle" : state)}
          onDrop={handleCertificateDrop}
          className={`mt-3 flex min-h-24 cursor-pointer items-center justify-center rounded border border-dashed p-4 text-center text-sm ${certificateUploadState === "dragging" ? "border-recovery bg-recovery-soft" : "border-hairline-strong hover:bg-canvas-soft"}`}
        >
          <input ref={certificateInputRef} className="sr-only" type="file" accept=".json,.pdf,application/json,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void parseCertificateFile(file); }} />
          {certificateUploadState === "parsing" ? "Parsing and verifying certificate…" : certificateUploadState === "dragging" ? "Drop certificate file here" : "Drop certificate file here, or click to browse — .json or .pdf"}
        </div>
        {certificateUploadMessage && (
          <p className={`mt-3 rounded border p-3 text-[13px] ${certificateUploadState === "valid" ? "border-success/30 bg-success-soft text-success" : certificateUploadState === "mismatched" ? "border-warning/30 bg-warning-soft text-warning" : certificateUploadState === "idle" ? "border-hairline-strong bg-canvas-soft text-body-muted" : "border-destructive/30 bg-destructive-soft text-destructive-active"}`} role="status">
            {certificateUploadState === "valid" ? "✓ " : ""}{certificateUploadMessage}
          </p>
        )}
      </DataCard>

      {(error || sourceError) && <p className="mb-4 text-[13px] text-destructive-active">{error ?? (sourceError instanceof Error ? sourceError.message : "Unable to load acquisitions.")}</p>}

      <DataCard className="mb-6">
        <p className="mb-3 text-[15px] font-medium text-ink">Scan type</p>
        <div className="flex gap-3">
          {(["quick", "deep"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setScanType(t)}
              className={
                "flex-1 rounded border px-4 py-3 text-left transition-colors " +
                (scanType === t
                  ? "border-recovery bg-recovery-soft"
                  : "border-hairline-strong hover:bg-canvas-soft")
              }
            >
              <p className="text-[14px] font-medium text-ink capitalize">{t}</p>
              <p className="text-[12px] text-body-muted">
                {t === "quick"
                  ? "Scans known filesystem remnants"
                  : "Full raw signature-based carve"}
              </p>
            </button>
          ))}
        </div>
      </DataCard>

      <Button
        variant="recovery"
        onClick={handleSubmit}
        disabled={!acquisitionId || blocked || submitting || ["parsing", "mismatched", "invalid", "unparseable"].includes(certificateUploadState)}
      >
        {submitting ? "Starting scan…" : "Start recovery scan"}
      </Button>
    </div>
  );
}
