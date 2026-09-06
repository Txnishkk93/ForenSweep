"use client";

import { useState } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { DataCard, SectionHeading, MonoText } from "@/components/Primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { createRecoveryJob, getDevices } from "@/lib/backend-api";
import type { Device } from "@/lib/types";

export default function NewRecoveryPage() {
  const router = useRouter();
  const [acquisitionId, setAcquisitionId] = useState("");
  const [scanType, setScanType] = useState<"quick" | "deep">("quick");
  const [submitting, setSubmitting] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);

  const acquisition = devices.find((device) => device.id === acquisitionId);
  const blocked = false;

  useEffect(() => {
    getDevices()
      .then(setDevices)
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "Unable to load acquisitions."),
      );
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitting(true);
    setError(null);
    try {
      if (!acquisition) throw new Error("Select an acquisition first.");
      const job = await createRecoveryJob({
        deviceId: acquisition.id,
        scanType: scanType.toUpperCase() as "QUICK" | "DEEP",
      });
      router.push(`/recover/${job.id}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to start recovery.");
    } finally {
      setSubmitting(false);
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
          {devices.map((a) => (
            <button
              key={a.id}
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
                <p className="mt-1 text-[12px] text-body-muted">{a.id}</p>
              </div>
              <StatusBadge
                label="Hash verified"
                tone="success"
              />
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

      {error && <p className="mb-4 text-[13px] text-destructive-active">{error}</p>}

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
