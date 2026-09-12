"use client";

import { useEffect, useRef, useState } from "react";
import { zipSync } from "fflate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { DataCard, SectionHeading, MonoText } from "@/components/Primitives";
import { ExpandableSection } from "@/components/ExpandableSection";
import { StatusBadge } from "@/components/StatusBadge";
import { authorizeRecoveryCertificate, auditRecoveryCertificateUpload, createRecoveryJob, getAvailableImages, getCertificates, getDevices, uploadAcquisition } from "@/lib/backend-api";
import { formatBytes } from "@/lib/status-colors";
import type { Certificate } from "@/lib/types";

export default function NewRecoveryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [acquisitionId, setAcquisitionId] = useState("");
  const [scanType, setScanType] = useState<"quick" | "deep">("quick");
  const [submitting, setSubmitting] = useState(false);
  const { data: devices = [], isLoading: loadingDevices, error: devicesError } = useQuery({ queryKey: ["devices"], queryFn: getDevices });
  const { data: images = [], isLoading: loadingImages, error: imagesError } = useQuery({ queryKey: ["available-images"], queryFn: getAvailableImages });
  const { data: certificates = [] } = useQuery({ queryKey: ["certificates"], queryFn: getCertificates });
  const loadingSources = loadingDevices || loadingImages;
  const sourceError = devicesError ?? imagesError;
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [authorizationCertificateId, setAuthorizationCertificateId] = useState("");
  const [uploadedCertificate, setUploadedCertificate] = useState<{ payload: Record<string, unknown>; contentHash: string; signature: string } | undefined>();
  const [certificateUploadState, setCertificateUploadState] = useState<"idle" | "dragging" | "parsing" | "valid" | "mismatched" | "invalid" | "unparseable">("idle");
  const [certificateUploadMessage, setCertificateUploadMessage] = useState<string | null>(null);
  const [pendingCertificateFile, setPendingCertificateFile] = useState<File | null>(null);
  const certificateInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);

  const acquisition = devices.find((device) => device.id === acquisitionId);
  const blocked = false;
  const recoveryTarget = acquisition ? { deviceId: acquisition.id } : acquisitionId ? { imageId: acquisitionId } : {};
  const sanitizedCertificates = certificates.filter((certificate) => certificate.verificationResult);
  const acquisitionCount = devices.length + images.length;
  const selectedAcquisition = acquisition ?? images.find((image) => image.id === acquisitionId);

  useEffect(() => {
    const certificateId = new URLSearchParams(window.location.search).get("certificateId");
    if (certificateId) setAuthorizationCertificateId(certificateId);
  }, []);

  useEffect(() => {
    directoryInputRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  useEffect(() => {
    const certificate = certificates.find((item) => item.id === authorizationCertificateId);
    if (certificate?.targetDeviceId) setAcquisitionId(certificate.targetDeviceId);
  }, [authorizationCertificateId, certificates]);

  useEffect(() => {
    if (!acquisitionId || !pendingCertificateFile) return;
    const file = pendingCertificateFile;
    setPendingCertificateFile(null);
    void parseCertificateFile(file);
  }, [acquisitionId, pendingCertificateFile]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      if (!acquisitionId) throw new Error("Select an acquisition first.");
      const job = await createRecoveryJob({
        ...(acquisition ? { deviceId: acquisition.id } : { imageId: acquisitionId }),
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
    try {
      if (!acquisitionId) {
        setPendingCertificateFile(file);
        setCertificateUploadState("idle");
        setCertificateUploadMessage("Certificate selected. Choose a recovery source to verify it against this target.");
        return;
      }
      let parsed: { payload: Record<string, unknown>; contentHash: string; signature: string };
      if (file.name.toLowerCase().endsWith(".json")) {
        parsed = JSON.parse(await file.text()) as typeof parsed;
      } else if (file.name.toLowerCase().endsWith(".pdf")) {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const attachments = await pdf.getAttachments();
        const attachmentValues = (attachments instanceof Map ? [...attachments.values()] : Object.values(attachments ?? {})) as Array<{ filename?: string; content?: Uint8Array }>;
        const attachment = attachmentValues.find((item) => item.filename === "forensweep-certificate.json" && item.content);
        if (attachment?.content) {
          parsed = JSON.parse(new TextDecoder().decode(attachment.content)) as typeof parsed;
        } else {
          const metadata = await pdf.getMetadata();
          const info = metadata.info as Record<string, unknown>;
          const subject = typeof info.Subject === "string" ? info.Subject : "";
          const encoded = subject.startsWith("ForenSweep-Certificate:") ? subject.slice("ForenSweep-Certificate:".length) : "";
          if (!encoded) throw new Error("This PDF does not contain an embedded certificate export. Download the JSON export from the certificate detail page and upload that file instead.");
          parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)))) as typeof parsed;
        }
      } else {
        throw new Error("Unsupported certificate file type.");
      }
      if (!parsed?.payload || typeof parsed.contentHash !== "string" || typeof parsed.signature !== "string") {
        throw new Error("The file does not contain a certificate export.");
      }
      const result = await authorizeRecoveryCertificate({ certificate: parsed, target: recoveryTarget });
      if (result.state === "VALID") {
        setUploadedCertificate(parsed);
        setCertificateUploadState("valid");
        setCertificateUploadMessage(`Certificate verified — ${result.targetDisplayName ?? "target"} sanitized on ${result.issuedAt ? new Date(result.issuedAt).toLocaleDateString() : "the recorded date"}.`);
      } else if (result.state === "MISMATCHED") {
        setCertificateUploadState("mismatched");
        setCertificateUploadMessage("This certificate is valid, but was issued for a different item — it can't authorize recovery of the current target.");
      } else {
        setCertificateUploadState("invalid");
        setCertificateUploadMessage("This file could not be verified as an authentic ForenSweep certificate — signature does not match.");
      }
    } catch (uploadError) {
      setCertificateUploadState("unparseable");
      setCertificateUploadMessage(uploadError instanceof Error && uploadError.message.startsWith("Select the recovery") ? uploadError.message : "This doesn't look like a certificate export — upload the .json or .pdf you downloaded from the Certificates page.");
      await auditRecoveryCertificateUpload({ outcome: "UNPARSEABLE", target: recoveryTarget, reason: uploadError instanceof Error ? uploadError.message : "parse_failed" }).catch(() => undefined);
    }
  }

  function handleCertificateDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setCertificateUploadState((state) => state === "dragging" ? "idle" : state);
    const file = event.dataTransfer.files[0];
    if (file) void parseCertificateFile(file);
  }

  async function handleSourceSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const firstFile = files[0];
    if (!firstFile) return;
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    try {
      const isSingleImage = files.length === 1 && /\.(img|zip)$/i.test(firstFile.name);
      const entries: Record<string, Uint8Array> = {};
      if (!isSingleImage) {
        for (const file of files) {
          entries[file.webkitRelativePath || file.name] = new Uint8Array(await file.arrayBuffer());
        }
      }
      const upload = isSingleImage
        ? firstFile
        : new File(
            [zipSync(entries)],
            "local-source.zip",
            { type: "application/zip" },
          );
      const result = await uploadAcquisition(upload, setUploadProgress);
      setAcquisitionId(result.acquisitionId);
      await queryClient.invalidateQueries({ queryKey: ["available-images"] });
      setError(isSingleImage ? null : "Local files were packaged into a recovery source. Results may not represent deleted-file recovery from an original disk image.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed. Check file type and size.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-2xl">
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
                    <Link
                      href={`/recover/new?certificateId=${certificate.id}`}
                      className="shrink-0 rounded border border-recovery px-3 py-1.5 text-[13px] font-medium text-recovery hover:bg-recovery-soft"
                    >
                      Recover
                    </Link>
                  </div>
                ))}
              </div>
            )}
          />
        ) : <p className="py-2 text-[13px] text-body-muted">No completed ForenSweep sanitizations found.</p>}
      </DataCard>

      <DataCard className="mb-4">
        <p className="mb-3 text-[15px] font-medium text-ink">
          Select a verified acquisition
        </p>
        <p className="mb-3 text-[13px] text-body-muted">
          Recovery only runs against a bit-for-bit forensic image whose hash
          has been verified — never against a live device directly.
        </p>
        <label className="mb-3 block rounded border border-dashed border-recovery/50 bg-recovery-soft px-3 py-2.5 text-sm text-ink">
          <span className="font-medium">Choose a forensic image, files, or a whole folder</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="rounded border border-recovery px-3 py-1.5 text-[13px] font-medium text-recovery" onClick={() => document.getElementById("recovery-source-files")?.click()} disabled={uploading}>Choose files</button>
            <button type="button" className="rounded border border-recovery px-3 py-1.5 text-[13px] font-medium text-recovery" onClick={() => directoryInputRef.current?.click()} disabled={uploading}>Choose folder</button>
          </div>
          <input id="recovery-source-files" className="sr-only" type="file" accept=".img,.zip,*/*" multiple onChange={handleSourceSelect} disabled={uploading} />
          <input ref={directoryInputRef} className="sr-only" type="file" multiple onChange={handleSourceSelect} disabled={uploading} />
          <span className="mt-0.5 block text-xs text-body-muted">Maximum upload size: 500MB. Local files and folders are packaged before upload.</span>
          {uploading && (
            <div className="mt-2">
              <div className="mb-1 flex justify-between text-xs text-body-muted"><span>Uploading</span><span>{uploadProgress}%</span></div>
              <progress className="h-2 w-full accent-recovery" max="100" value={uploadProgress} />
            </div>
          )}
        </label>
        {selectedAcquisition && !devices.slice(0, 3).some((device) => device.id === acquisitionId) && !images.slice(0, 3).some((image) => image.id === acquisitionId) && (
          <p className="mb-3 text-[12px] text-body-muted">Selected: <span className="font-medium text-ink">{"model" in selectedAcquisition ? selectedAcquisition.model ?? selectedAcquisition.type : selectedAcquisition.filename}</span></p>
        )}
        <div className="flex flex-col gap-2">
          {loadingSources && <p className="text-sm text-body-muted">Loading acquisitions...</p>}
          {!loadingSources && !devices.length && !images.length && !error && (
            <p className="text-sm text-body-muted">No verified acquisitions or storage devices detected.</p>
          )}
          <ExpandableSection
            visibleCount={3}
            totalCount={acquisitionCount}
            renderListAction={(expanded) => (
              <>
                {devices.slice(0, expanded ? devices.length : 3).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    disabled={Boolean(a.mounted || a.isSystemDisk)}
                    onClick={() => setAcquisitionId(a.id)}
                    className={"flex w-full items-center justify-between rounded border px-4 py-3 text-left transition-colors " + (acquisitionId === a.id ? "border-recovery bg-recovery-soft" : "border-hairline-strong hover:bg-canvas-soft")}
                  >
                    <div>
                      <MonoText>{a.path}</MonoText>
                      <p className="mt-1 text-[12px] text-body-muted">{a.model ?? a.type}</p>
                    </div>
                    <StatusBadge label={a.mounted || a.isSystemDisk ? "Unavailable" : "Device"} tone={a.mounted || a.isSystemDisk ? "warning" : "success"} />
                  </button>
                ))}
                {images.slice(0, expanded ? images.length : Math.max(0, 3 - devices.length)).map((image) => (
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
                    <StatusBadge label="Image" tone="success" />
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
          <p className={`mt-3 rounded border p-3 text-[13px] ${certificateUploadState === "valid" ? "border-success/30 bg-success-soft text-success" : certificateUploadState === "mismatched" ? "border-warning/30 bg-warning-soft text-warning" : "border-destructive/30 bg-destructive-soft text-destructive-active"}`} role="status">
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
