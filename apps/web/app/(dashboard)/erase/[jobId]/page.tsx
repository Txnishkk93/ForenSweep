"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataCard, SectionHeading } from "@/components/Primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/Button";
import { jobStatusLabel, jobStatusTone, riskTone } from "@/lib/status-colors";
import { approveJob, getJob } from "@/lib/backend-api";
import type { JobStatus, RiskLevel } from "@/lib/types";

function useLiveJob(jobId: string) {
  const [status, setStatus] = useState<JobStatus>("QUEUED");
  const [progress, setProgress] = useState(0);
  const [currentPass, setCurrentPass] = useState("Preparing");
  const [approved, setApproved] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [riskLevel, setRiskLevel] = useState<RiskLevel | null>(null);
  const [certificateId, setCertificateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const job = await getJob(jobId);
        if (!active) return;
        setStatus(job.status);
        setProgress(job.progress);
        setVerified(job.verified);
        setRiskLevel(job.residualRiskLevel);
        setApproved(job.approvalStatus === "APPROVED" || job.approvalStatus === "NOT_REQUIRED");
        setCurrentPass(String((job as unknown as { stage?: string; currentPass?: number }).stage ?? (job as unknown as { currentPass?: number }).currentPass ?? "Processing"));
        setCertificateId(job.certificate?.id ?? null);
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Unable to load job.");
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [jobId]);

  return { status, progress, currentPass, approved, setApproved, verified, riskLevel, certificateId, error };
}

export default function EraseJobDetailPage({
  params,
}: {
  params: { jobId: string };
}) {
  const { status, progress, currentPass, approved, setApproved, verified, riskLevel, certificateId, error } =
    useLiveJob(params.jobId);
  const [approving, setApproving] = useState(false);

  async function handleApprove() {
    setApproving(true);
    try {
      await approveJob(params.jobId);
      setApproved(true);
    } catch {
      // The polling request will surface the backend error state if approval fails.
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <SectionHeading
        eyebrow="Erasure job"
        title={params.jobId}
        action={<StatusBadge label={jobStatusLabel(status)} tone={jobStatusTone(status)} />}
      />

      {error && <p className="mb-6 text-sm text-destructive-active">{error}</p>}

      {!approved && status !== "COMPLETED" && status !== "FAILED" && (
        <DataCard className="mb-6 border-warning/30 bg-warning-soft">
          <p className="text-[14px] font-medium text-warning">
            Waiting for admin approval
          </p>
          <p className="mt-1 text-[13px] text-warning">
            Whole-drive erasure requires a second approver before it can run.
          </p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={handleApprove}
            disabled={approving}
          >
            {approving ? "Approving..." : "Approve as admin"}
          </Button>
        </DataCard>
      )}

      {approved && status !== "COMPLETED" && status !== "FAILED" && (
        <DataCard className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[14px] font-medium text-ink">{currentPass}</p>
            <p className="text-[13px] text-body-muted">{progress}%</p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-strong">
            <div
              className="h-full bg-destructive transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </DataCard>
      )}

      {status === "COMPLETED" && (
        <DataCard className="mb-6 border-success/30 bg-success-soft">
          <p className="text-[14px] font-medium text-success">
            Verification passed
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[13px] text-success">Residual risk:</span>
            <StatusBadge
              label={riskLevel ?? "—"}
              tone={riskTone(riskLevel)}
            />
          </div>
          <Link href={certificateId ? `/certificates/${certificateId}` : "/certificates"}>
            <Button variant="secondary" className="mt-4">
              View certificate →
            </Button>
          </Link>
        </DataCard>
      )}
    </div>
  );
}
