"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataCard, MonoText, SectionHeading } from "@/components/Primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/Button";
import { exportRecoveredFile, getJob, getRecoveredFiles } from "@/lib/backend-api";
import { confidenceTone, formatBytes } from "@/lib/status-colors";
import type { RecoveredFile } from "@/lib/types";

function ScoreBar({ label, value }: { label: string; value: number | undefined }) {
  const v = Math.round((value ?? 0) * 100);
  return (
    <div>
      <div className="flex justify-between text-[12px] text-body-muted">
        <span>{label}</span>
        <span>{v}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-strong">
        <div
          className="h-full bg-recovery"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

function FileRow({ file, onExport }: { file: RecoveredFile; onExport: (fileId: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-hairline last:border-0">
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-canvas-soft border border-hairline text-[11px] font-medium uppercase text-body-muted">
          {file.fileType}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-ink">
            {file.fileName ?? "Unnamed recovered file"}
          </p>
          <p className="text-[12px] text-body-muted">
            {formatBytes(
              String(Number(file.offsetEnd) - Number(file.offsetStart))
            )}{" "}
            · offset {file.offsetStart}–{file.offsetEnd}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {file.isTruncated && <StatusBadge label="Truncated" tone="warning" />}
          {file.isFragmented && (
            <StatusBadge label={`${file.fragmentCount} fragments`} tone="neutral" />
          )}
          <StatusBadge
            label={`${file.confidenceLevel} · ${Math.round(file.confidenceScore * 100)}%`}
            tone={confidenceTone(file.confidenceLevel)}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-[13px] font-medium text-primary hover:text-primary-active"
          >
            {open ? "Hide" : "Why?"}
          </button>
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-[13px]"
            onClick={() => onExport(file.id)}
          >
            Export
          </Button>
        </div>
      </div>
      {open && (
        <div className="mx-5 mb-4 rounded border border-hairline bg-canvas-soft p-4">
          <div className="grid grid-cols-2 gap-4">
            <ScoreBar label="Header match" value={file.headerScore} />
            <ScoreBar label="Structure validity" value={file.structureScore} />
            <ScoreBar label="Parser decode" value={file.parserScore} />
            <ScoreBar label="Fragmentation" value={file.fragmentationScore} />
          </div>
          <ul className="mt-4 flex flex-col gap-1 text-[13px] text-body">
            {(file.reasons ?? []).map((r, i) => (
              <li key={i}>· {r}</li>
            ))}
          </ul>
          {file.reconstructionMethod && (
            <p className="mt-3 text-[12px] text-body-muted">
              Reconstruction method: <MonoText>{file.reconstructionMethod}</MonoText>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function RecoveryJobDetailPage({
  params,
}: {
  params: { jobId: string };
}) {
  const [error, setError] = useState<string | null>(null);
  const jobQuery = useQuery({
    queryKey: ["job", params.jobId],
    queryFn: () => getJob(params.jobId),
    refetchInterval: (query) =>
      ["COMPLETED", "FAILED", "CANCELLED"].includes(query.state.data?.status ?? "")
        ? false
        : 2000,
  });
  const filesQuery = useQuery({
    queryKey: ["recovered-files", params.jobId],
    queryFn: () => getRecoveredFiles(params.jobId),
    refetchInterval: jobQuery.data && ["COMPLETED", "FAILED", "CANCELLED"].includes(jobQuery.data.status)
      ? false
      : 2000,
  });
  const job = jobQuery.data;
  const files = filesQuery.data ?? [];
  const queryError = jobQuery.error ?? filesQuery.error;
  const displayError = error ?? (queryError instanceof Error ? queryError.message : null);

  async function handleExport(fileId: string) {
    try {
      await exportRecoveredFile(fileId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to export recovered file.");
    }
  }

  const highConfidenceCount = files.filter((file) => file.confidenceLevel === "HIGH").length;

  return (
    <div className="max-w-3xl">
      <SectionHeading
        eyebrow="Recovery job"
        title={params.jobId}
        action={
          <StatusBadge
            label={job?.status ?? "Loading"}
            tone={job?.status === "COMPLETED" ? "success" : "neutral"}
          />
        }
      />

      {displayError && <p className="mb-6 text-sm text-destructive-active">{displayError}</p>}

      <DataCard className="mb-6 border-recovery/30 bg-recovery-soft">
        <p className="text-[13px] text-recovery">
          {job?.status === "COMPLETED" ? "Deep scan complete" : "Recovery scan in progress"} — {files.length} candidate files found,{" "}
          {highConfidenceCount}{" "}
          validated with high confidence.
        </p>
      </DataCard>

      <DataCard className="p-0">
        {files.map((f) => (
          <FileRow key={f.id} file={f} onExport={handleExport} />
        ))}
      </DataCard>
    </div>
  );
}
