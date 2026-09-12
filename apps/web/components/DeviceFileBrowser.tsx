"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { File, Folder, ArrowUp, X } from "lucide-react";
import { browseDevice } from "@/lib/backend-api";
import { EmptyState, LoadingState } from "@/components/Primitives";
import { formatBytes } from "@/lib/status-colors";
import type { DeviceFsEntry } from "@/lib/types";

export function DeviceFileBrowser({
  deviceId,
  selectedPaths,
  onSelectionChange,
}: {
  deviceId: string;
  selectedPaths: DeviceFsEntry[];
  onSelectionChange: (entries: DeviceFsEntry[]) => void;
}) {
  const [path, setPath] = useState(".");
  const query = useQuery({
    queryKey: ["device-browse", deviceId, path],
    queryFn: () => browseDevice(deviceId, path),
    enabled: Boolean(deviceId),
  });
  const selected = new Map(selectedPaths.map((entry) => [entry.path, entry]));
  const data = query.data;

  function toggle(entry: DeviceFsEntry) {
    const next = new Map(selected);
    if (next.has(entry.path)) next.delete(entry.path);
    else next.set(entry.path, entry);
    onSelectionChange([...next.values()]);
  }

  const segments = data?.currentPath && data.currentPath !== "."
    ? data.currentPath.split(/[\\/]/).filter(Boolean)
    : [];

  return (
    <div className="mt-4 rounded-lg border border-hairline bg-canvas-soft">
      <div className="flex flex-wrap items-center gap-1 border-b border-hairline px-4 py-3 text-[12px]">
        <button type="button" onClick={() => setPath(".")} className="font-medium text-ink hover:underline">
          Device root
        </button>
        {segments.map((segment, index) => {
          const target = segments.slice(0, index + 1).join("/");
          return (
            <span key={target} className="flex items-center gap-1 text-body-muted">
              / <button type="button" onClick={() => setPath(target)} className="text-ink hover:underline">{segment}</button>
            </span>
          );
        })}
        {data?.parentPath && (
          <button type="button" onClick={() => setPath(data.parentPath!)} className="ml-auto inline-flex items-center gap-1 text-body hover:text-ink">
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> Up
          </button>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto p-2">
        {query.isLoading && <LoadingState label="Loading device contents" />}
        {query.error && <p className="p-3 text-sm text-destructive-active">{query.error instanceof Error ? query.error.message : "Unable to browse this device."}</p>}
        {!query.isLoading && !query.error && data?.entries.length === 0 && <EmptyState title="This folder is empty" />}
        {data?.entries.map((entry) => {
          const checked = selected.has(entry.path);
          const Icon = entry.type === "directory" ? Folder : File;
          return (
            <div
              key={entry.path}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" && entry.type === "directory") setPath(entry.path);
              }}
              onDoubleClick={() => entry.type === "directory" && setPath(entry.path)}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(entry)}
                onClick={(event) => event.stopPropagation()}
                aria-label={`Select ${entry.name}`}
              />
              <Icon className="h-4 w-4 shrink-0 text-body-muted" aria-hidden="true" />
              <button
                type="button"
                onClick={() => entry.type === "directory" && setPath(entry.path)}
                className="min-w-0 flex-1 truncate text-left text-[13px] text-ink hover:underline"
              >
                {entry.name}
              </button>
              <span className="text-[11px] text-body-muted">{entry.sizeBytes ? formatBytes(entry.sizeBytes) : "Folder"}</span>
              <span className="hidden text-[11px] text-body-muted md:inline">{entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleDateString() : ""}</span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-hairline px-4 py-3">
        <p className="mb-2 text-[11px] text-body-muted">{selectedPaths.length} item{selectedPaths.length === 1 ? "" : "s"} selected</p>
        <div className="flex flex-wrap gap-1.5">
          {selectedPaths.map((entry) => (
            <span key={entry.path} className="inline-flex max-w-full items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] text-ink">
              <span className="max-w-48 truncate">{entry.path}</span>
              <button type="button" onClick={() => toggle(entry)} aria-label={`Remove ${entry.name}`} className="text-body-muted hover:text-ink">
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
