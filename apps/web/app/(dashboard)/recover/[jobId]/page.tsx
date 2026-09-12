"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataCard, MonoText, SectionHeading } from "@/components/Primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/Button";
import { downloadRecoveredFile, exportRecoveredFile, getJob, getRecoveredFiles } from "@/lib/backend-api";
import { saveBytesToDisk } from "@/lib/save-file";
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

function FileRow({
  file,
  selected,
  onSelect,
  onExport,
}: {
  file: RecoveredFile;
  selected: boolean;
  onSelect: (file: RecoveredFile) => void;
  onExport: (file: RecoveredFile) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-hairline last:border-0">
      <div className="flex items-center gap-4 px-5 py-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(file)}
          aria-label={`Select ${file.fileName ?? "recovered file"}`}
        />
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
            onClick={() => onExport(file)}
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportProgress, setExportProgress] = useState<string | null>(null);
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

  async function handleExport(file: RecoveredFile) {
    setError(null);
    setExportProgress(`Exporting ${file.fileName ?? "recovered file"}...`);
    try {
      await exportRecoveredFile(file.id);
      const blob = await downloadRecoveredFile(params.jobId, file.id);
      await saveBytesToDisk(file.fileName ?? `recovered-${file.id}`, blob);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to export recovered file.");
    } finally {
      setExportProgress(null);
    }
  }

  async function handleBulkExport() {
    const filesToExport = selectedIds.size
      ? files.filter((file) => selectedIds.has(file.id))
      : files;
    if (!filesToExport.length) return;
    setError(null);
    try {
      for (const [index, file] of filesToExport.entries()) {
        setExportProgress(`Exporting ${index + 1} of ${filesToExport.length}...`);
        await exportRecoveredFile(file.id);
        const blob = await downloadRecoveredFile(params.jobId, file.id);
        await saveBytesToDisk(file.fileName ?? `recovered-${file.id}`, blob);
      }
      setSelectedIds(new Set());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to export recovered files.");
    } finally {
      setExportProgress(null);
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
      {exportProgress && <p className="mb-6 text-sm text-body-muted" role="status">{exportProgress}</p>}

      <DataCard className="mb-6 border-recovery/30 bg-recovery-soft">
        <p className="text-[13px] text-recovery">
          {job?.status === "COMPLETED" ? "Deep scan complete" : "Recovery scan in progress"} — {files.length} candidate files found,{" "}
          {highConfidenceCount}{" "}
          validated with high confidence.
        </p>
      </DataCard>

      <DataCard className="p-0">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <label className="flex items-center gap-2 text-[12px] text-body-muted">
            <input
              type="checkbox"
              checked={Boolean(files.length) && selectedIds.size === files.length}
              onChange={() => setSelectedIds(selectedIds.size === files.length ? new Set() : new Set(files.map((file) => file.id)))}
              aria-label="Select all recovered files"
            />
            {selectedIds.size ? `${selectedIds.size} selected` : `${files.length} files`}
          </label>
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-[13px]"
            onClick={handleBulkExport}
            disabled={!files.length || Boolean(exportProgress)}
          >
            {selectedIds.size ? "Export selected" : "Export all"}
          </Button>
        </div>
        {files.map((f) => (
          <FileRow
            key={f.id}
            file={f}
            selected={selectedIds.has(f.id)}
            onSelect={(file) => setSelectedIds((current) => {
              const next = new Set(current);
              if (next.has(file.id)) next.delete(file.id);
              else next.add(file.id);
              return next;
            })}
            onExport={handleExport}
          />
        ))}
      </DataCard>
    </div>
  );
}
