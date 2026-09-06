"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { DataCard, SectionHeading, MonoText } from "@/components/Primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { createRecoveryJob, getAvailableImages, getDevices, uploadAcquisition } from "@/lib/backend-api";
import { formatBytes } from "@/lib/status-colors";

export default function NewRecoveryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [acquisitionId, setAcquisitionId] = useState("");
  const [scanType, setScanType] = useState<"quick" | "deep">("quick");
  const [submitting, setSubmitting] = useState(false);
  const { data: devices = [], isLoading: loadingDevices, error: devicesError } = useQuery({ queryKey: ["devices"], queryFn: getDevices });
  const { data: images = [], isLoading: loadingImages, error: imagesError } = useQuery({ queryKey: ["available-images"], queryFn: getAvailableImages });
  const loadingSources = loadingDevices || loadingImages;
  const sourceError = devicesError ?? imagesError;
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const acquisition = devices.find((device) => device.id === acquisitionId);
  const blocked = false;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      if (!acquisitionId) throw new Error("Select an acquisition first.");
      const job = await createRecoveryJob({
        ...(acquisition ? { deviceId: acquisition.id } : { imageId: acquisitionId }),
        scanType: scanType.toUpperCase() as "QUICK" | "DEEP",
      });
      router.push(`/recover/${job.id}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to start recovery.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    try {
      const result = await uploadAcquisition(file, setUploadProgress);
      setAcquisitionId(result.acquisitionId);
      await queryClient.invalidateQueries({ queryKey: ["available-images"] });
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
        <p className="mb-3 text-[15px] font-medium text-ink">
          Select a verified acquisition
        </p>
        <p className="mb-3 text-[13px] text-body-muted">
          Recovery only runs against a bit-for-bit forensic image whose hash
          has been verified — never against a live device directly.
        </p>
        <div className="flex flex-col gap-2">
          <label className="mb-2 rounded border border-dashed border-recovery/50 bg-recovery-soft p-4 text-sm text-ink">
            <span className="font-medium">Upload a forensic image or ZIP test set</span>
            <input className="mt-2 block w-full text-sm" type="file" accept=".img,.zip" onChange={handleFileSelect} disabled={uploading} />
            <span className="mt-1 block text-xs text-body-muted">Maximum upload size: 500MB</span>
            {uploading && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-body-muted"><span>Uploading</span><span>{uploadProgress}%</span></div>
                <progress className="h-2 w-full accent-recovery" max="100" value={uploadProgress} />
              </div>
            )}
          </label>
          {loadingSources && <p className="text-sm text-body-muted">Loading acquisitions...</p>}
          {!loadingSources && !devices.length && !images.length && !error && (
            <p className="text-sm text-body-muted">No verified acquisitions or storage devices detected.</p>
          )}
          {devices.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={Boolean(a.mounted || a.isSystemDisk)}
              onClick={() => setAcquisitionId(a.id)}
              className={
                "flex items-center justify-between rounded border px-4 py-3 text-left transition-colors " +
                (acquisitionId === a.id
                  ? "border-recovery bg-recovery-soft"
                  : "border-hairline-strong hover:bg-canvas-soft")
              }
            >
              <div>
                <MonoText>{a.path}</MonoText>
                <p className="mt-1 text-[12px] text-body-muted">{a.model ?? a.type}</p>
              </div>
              <StatusBadge label={a.mounted || a.isSystemDisk ? "Unavailable" : "Device"} tone={a.mounted || a.isSystemDisk ? "warning" : "success"} />
            </button>
          ))}
          {images.map((image) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setAcquisitionId(image.id)}
              className={
                "flex items-center justify-between rounded border px-4 py-3 text-left transition-colors " +
                (acquisitionId === image.id
                  ? "border-recovery bg-recovery-soft"
                  : "border-hairline-strong hover:bg-canvas-soft")
              }
            >
              <div>
                <p className="text-[14px] font-medium text-ink">{image.filename}</p>
                <p className="mt-1 text-[12px] text-body-muted">{formatBytes(image.sizeBytes)}</p>
              </div>
              <StatusBadge label="Image" tone="success" />
            </button>
          ))}
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
        disabled={!acquisitionId || blocked || submitting}
      >
        {submitting ? "Starting scan…" : "Start recovery scan"}
      </Button>
    </div>
  );
}
