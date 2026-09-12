"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { DataCard, MonoText } from "@/components/Primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { createEraseJob, getDeviceProfile, getDevices, profileToPlan, refreshDevices } from "@/lib/backend-api";
import { formatBytes } from "@/lib/status-colors";
import { LocalFileBrowser } from "@/components/LocalFileBrowser";
import type { FsEntry } from "@/lib/types";

type Scope = "whole_drive" | "files";
type Standard = "NIST_800_88" | "DOD_5220_22_M";
type EraseTarget =
  | { mode: "device"; deviceId: string }
  | { mode: "files"; paths: FsEntry[] };

const STEPS = ["Device", "Scope", "Standard", "Preview", "Confirm", "Submit"];

export function EraseWizard({ initialDeviceId }: { initialDeviceId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [deviceId, setDeviceId] = useState<string>(initialDeviceId ?? "");
  const [scope, setScope] = useState<Scope>("whole_drive");
  const [eraseTarget, setEraseTarget] = useState<EraseTarget>(
    initialDeviceId ? { mode: "device", deviceId: initialDeviceId } : { mode: "device", deviceId: "" },
  );
  const [localFiles, setLocalFiles] = useState<FsEntry[]>([]);
  const [standard, setStandard] = useState<Standard>("NIST_800_88");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [refreshingDevices, setRefreshingDevices] = useState(false);
  const { data: devices = [], isLoading: loadingDevices } = useQuery({ queryKey: ["devices"], queryFn: getDevices });
  const { data: profile } = useQuery({
    queryKey: ["device-profile", deviceId],
    queryFn: () => getDeviceProfile(deviceId),
    enabled: Boolean(deviceId),
  });
  const plan = profile ? profileToPlan(profile) : undefined;
  const effectivePlan = eraseTarget.mode === "files"
    ? { method: "FILE_LEVEL_OVERWRITE" as const, nistCategory: "CLEAR" as const, justification: "Each selected path will be securely overwritten before removal.", limitations: "SSD wear-leveling can retain data outside the logical file path." }
    : plan;

  const device = devices.find((d) => d.id === deviceId);
  const requiredConfirm = eraseTarget.mode === "files" ? "ERASE" : device?.serial ?? "ERASE";
  const canProceedFromConfirm = confirmText === requiredConfirm;

  async function handleRefresh() {
    setRefreshingDevices(true);
    setSubmitError(null);
    try {
      await refreshDevices();
      await queryClient.invalidateQueries({ queryKey: ["devices"] });
    } catch (requestError) {
      setSubmitError(requestError instanceof Error ? requestError.message : "Unable to rescan devices.");
    } finally {
      setRefreshingDevices(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (eraseTarget.mode === "device" && (!device || !effectivePlan)) throw new Error("Select a device with an available policy.");
      if (eraseTarget.mode === "files" && !localFiles.length) throw new Error("Select at least one file or folder.");
      const job = await createEraseJob({
        ...(eraseTarget.mode === "device" ? { deviceId: device!.id } : {}),
        eraseScope: eraseTarget.mode === "device" ? "WHOLE_DRIVE" : "SPECIFIC_FILES",
        requestedMethod: effectivePlan!.method,
        standard,
        typeToConfirm: confirmText,
        ...(eraseTarget.mode === "files"
          ? { eraseFileList: localFiles.map((entry) => entry.path) }
          : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["job-summary"] });
      router.push(`/erase/${job.id}`);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Could not submit job."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={
                "flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-medium " +
                (i === step
                  ? "bg-destructive text-white"
                  : i < step
                  ? "bg-success-soft text-success"
                  : "bg-surface-strong text-body-muted")
              }
            >
              {i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className="h-px w-6 bg-hairline-strong" />
            )}
          </div>
        ))}
      </div>

      {step === 0 && (
        <DataCard>
          <p className="mb-3 text-[15px] font-medium text-ink">Select device</p>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex rounded border border-hairline-strong bg-canvas-soft p-0.5" role="group" aria-label="Erase target">
              <button type="button" onClick={() => { setEraseTarget({ mode: "device", deviceId }); setScope("whole_drive"); }} className={`rounded px-3 py-1.5 text-[12px] font-medium ${eraseTarget.mode === "device" ? "bg-white text-ink shadow-sm" : "text-body-muted"}`}>Whole device</button>
              <button type="button" onClick={() => { setEraseTarget({ mode: "files", paths: localFiles }); setScope("files"); }} className={`rounded px-3 py-1.5 text-[12px] font-medium ${eraseTarget.mode === "files" ? "bg-white text-ink shadow-sm" : "text-body-muted"}`}>Files &amp; folders</button>
            </div>
            <Button variant="secondary" onClick={handleRefresh} disabled={refreshingDevices || loadingDevices}>
              {refreshingDevices ? "Rescanning..." : "Rescan"}
            </Button>
          </div>
          {eraseTarget.mode === "files" ? (
            <LocalFileBrowser selectedPaths={localFiles} onSelectionChange={(paths) => { setLocalFiles(paths); setEraseTarget({ mode: "files", paths }); }} />
          ) : <div className="flex flex-col gap-2">
            {loadingDevices && <p className="text-sm text-body-muted">Loading devices...</p>}
            {!loadingDevices && !devices.length && !submitError && (
              <p className="text-sm text-body-muted">No removable or fixed storage devices detected - check connections and try Rescan.</p>
            )}
            {!loadingDevices && submitError && <p className="text-sm text-destructive-active">{submitError}</p>}
            {devices.map((d) => (
              <button
                key={d.id}
                type="button"
                disabled={Boolean(d.isSystemDisk)}
                onClick={() => { setDeviceId(d.id); setEraseTarget({ mode: "device", deviceId: d.id }); }}
                className={
                  "rounded border px-4 py-3 text-left transition-colors " +
                  (deviceId === d.id
                    ? "border-primary bg-primary-soft"
                    : "border-hairline-strong hover:bg-canvas-soft")
                }
              >
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-medium text-ink">
                    {d.model} · {d.type}
                  </p>
                  <span className="text-[13px] text-body-muted">
                    {formatBytes(d.sizeBytes)}
                  </span>
                </div>
                <MonoText className="mt-1">{d.path}</MonoText>
                <div className="mt-2 flex gap-1.5">
                  <StatusBadge label={d.type} tone="neutral" />
                  {d.mounted && <StatusBadge label="Mounted" tone="warning" />}
                  {d.isSystemDisk && <StatusBadge label="System disk" tone="destructive" />}
                </div>
              </button>
            ))}
          </div>}
        </DataCard>
      )}

      {step === 1 && (
        <DataCard>
          <p className="mb-3 text-[15px] font-medium text-ink">Select scope</p>
          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-3 rounded border border-hairline-strong p-4">
              <input
                type="radio"
                checked={scope === "whole_drive"}
                onChange={() => { setScope("whole_drive"); setEraseTarget({ mode: "device", deviceId }); }}
                className="mt-1"
              />
              <div>
                <p className="text-[14px] font-medium text-ink">Whole drive</p>
                <p className="text-[13px] text-body-muted">
                  Sanitizes the entire device. Requires admin approval before
                  execution.
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded border border-hairline-strong p-4">
              <input
                type="radio"
                checked={scope === "files"}
                onChange={() => { setScope("files"); setEraseTarget({ mode: "files", paths: localFiles }); }}
                className="mt-1"
              />
              <div className="w-full">
                <p className="text-[14px] font-medium text-ink">
                  Specific files or folders
                </p>
                {scope === "files" && <p className="mt-2 text-[13px] text-body-muted">Selected paths are reviewed in step 1.</p>}
              </div>
            </label>
          </div>
        </DataCard>
      )}

      {step === 2 && (
        <DataCard>
          <p className="mb-3 text-[15px] font-medium text-ink">
            Select standard
          </p>
          <div className="flex flex-col gap-2">
            {(["NIST_800_88", "DOD_5220_22_M"] as Standard[]).map((s) => (
              <button
                key={s}
                onClick={() => setStandard(s)}
                className={
                  "rounded border px-4 py-3 text-left text-[14px] font-medium transition-colors " +
                  (standard === s
                    ? "border-primary bg-primary-soft text-primary-active"
                    : "border-hairline-strong text-ink hover:bg-canvas-soft")
                }
              >
                {s === "NIST_800_88" ? "NIST SP 800-88 Rev. 2" : "DoD 5220.22-M"}
              </button>
            ))}
          </div>
        </DataCard>
      )}

      {step === 3 && effectivePlan && (device || eraseTarget.mode === "files") && (
        <DataCard>
          <p className="mb-3 text-[15px] font-medium text-ink">
            Recommendation preview
          </p>
          <div className="flex items-center gap-2">
            <p className="text-[18px] font-medium text-ink">{effectivePlan.method}</p>
            <StatusBadge label={`NIST: ${effectivePlan.nistCategory}`} tone="info" />
          </div>
          <p className="mt-2 text-[14px] text-body">{effectivePlan.justification}</p>
          {effectivePlan.limitations && (
            <div className="mt-4 rounded border border-warning/30 bg-warning-soft p-4">
              <p className="text-[13px] font-medium text-warning">
                Limitation
              </p>
              <p className="mt-1 text-[13px] text-warning">
                {effectivePlan.limitations}
              </p>
            </div>
          )}
        </DataCard>
      )}

      {step === 4 && (device || eraseTarget.mode === "files") && (
        <DataCard className="border-destructive/40 bg-destructive-soft">
          <p className="text-[15px] font-semibold text-destructive-active">
            This action is irreversible
          </p>
          <p className="mt-1 text-[13px] text-destructive-active/90">
            You are about to securely erase {eraseTarget.mode === "files" ? "these selected paths" : <><strong>{device?.model}</strong> ({device?.path})</>} using {effectivePlan?.method}. Data will not be recoverable
            through normal means once this completes and verification passes.
          </p>
          {eraseTarget.mode === "files" && <div className="mt-3 max-h-36 overflow-y-auto rounded border border-destructive/20 bg-white p-3 font-mono text-[12px]">{localFiles.map((entry) => <div key={entry.path}>{entry.path}</div>)}</div>}
          <p className="mt-4 text-[13px] font-medium text-destructive-active">
            Type {eraseTarget.mode === "files" ? "ERASE" : "the device serial"} to confirm: <MonoText>{requiredConfirm}</MonoText>
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mt-2 w-full rounded border border-destructive/40 bg-white px-3 py-2 font-mono text-[13px]"
            placeholder="Type serial exactly"
          />
        </DataCard>
      )}

      {step === 5 && (
        <DataCard>
          <p className="text-[15px] font-medium text-ink">Ready to submit</p>
          <p className="mt-1 text-[13px] text-body-muted">
            The job will be created and, if scope is whole drive, will require
            admin approval before it runs.
          </p>
          {submitError && (
            <p className="mt-3 text-[13px] text-destructive-active">
              {submitError}
            </p>
          )}
        </DataCard>
      )}

      <div className="mt-6 flex justify-between">
        <Button
          variant="secondary"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            variant={step === 4 ? "destructive" : "primary"}
            onClick={() => setStep((s) => s + 1)}
            disabled={
              (step === 0 && (eraseTarget.mode === "device" ? !deviceId : !localFiles.length)) ||
              (step === 1 && scope === "files" && localFiles.length === 0) ||
              (step === 4 && !canProceedFromConfirm)
            }
          >
            {step === 4 ? "Confirm and continue" : "Continue"}
          </Button>
        ) : (
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Submitting…" : "Submit erasure job"}
          </Button>
        )}
      </div>
    </div>
  );
}
