"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataCard, SectionHeading } from "@/components/Primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { getCertificatesFromJobs, getDeviceProfile, getDevices, getJobs } from "@/lib/backend-api";
import { jobStatusLabel, jobStatusTone } from "@/lib/status-colors";
import type { Certificate, Device, Job, JobStatus, SanitizationPlan } from "@/lib/types";

function countByStatus(jobs: Job[], status: JobStatus) {
  return jobs.filter((j) => j.status === status).length;
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [plans, setPlans] = useState<Record<string, SanitizationPlan>>({});
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const counts: { status: JobStatus; label: string }[] = [
    { status: "QUEUED", label: "Queued" },
    { status: "RUNNING", label: "Running" },
    { status: "COMPLETED", label: "Completed" },
    { status: "FAILED", label: "Failed" },
  ];

  const flaggedDevices = devices.filter((device) => plans[device.id]?.limitations);

  useEffect(() => {
    Promise.all([getJobs(), getDevices()])
      .then(async ([loadedJobs, loadedDevices]) => {
        setJobs(loadedJobs);
        setDevices(loadedDevices);
        const profiles = await Promise.all(
          loadedDevices.map((device) =>
            getDeviceProfile(device.id).then((profile) => [device.id, {
              method: profile.recommendedMethod ?? "OVERWRITE_MULTI",
              nistCategory: "CLEAR",
              justification: profile.sanitizationLabel ?? "",
              limitations: profile.warnings?.join(" ") || null,
            } as SanitizationPlan] as const).catch(() => null),
          ),
        );
        setPlans(Object.fromEntries(profiles.filter((entry): entry is readonly [string, SanitizationPlan] => entry !== null)));
        setCertificates(await getCertificatesFromJobs(loadedJobs));
      })
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "Unable to load dashboard data."),
      );
  }, []);

  return (
    <div className="flex max-w-5xl flex-col gap-10">
      <div>
        <p className="text-[13px] text-body-muted">Overview</p>
        <h1 className="text-[28px] font-medium tracking-tighter text-ink">
          Dashboard
        </h1>
      </div>
      {error && <p className="text-sm text-destructive-active">{error}</p>}

      <section>
        <div className="grid grid-cols-4 gap-4">
          {counts.map((c) => (
            <DataCard key={c.status}>
              <p className="text-[13px] text-body-muted">{c.label}</p>
              <p className="mt-1 text-[28px] font-medium tracking-tighter text-ink">
                {countByStatus(jobs, c.status)}
              </p>
            </DataCard>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-6">
        <DataCard className="p-0">
          <div className="border-b border-hairline px-5 py-3">
            <p className="text-[13px] font-medium text-body-muted">
              Start a new operation
            </p>
          </div>
          <div className="flex flex-col divide-y divide-hairline">
            <Link
              href="/erase/new"
              className="flex items-center justify-between px-5 py-4 hover:bg-destructive-soft"
            >
              <div>
                <p className="text-[15px] font-medium text-ink">
                  Secure erasure
                </p>
                <p className="text-[13px] text-body-muted">
                  Sanitize a device or specific files
                </p>
              </div>
              <span className="text-destructive-active text-sm font-medium">
                Start
              </span>
            </Link>
            <Link
              href="/recover/new"
              className="flex items-center justify-between px-5 py-4 hover:bg-recovery-soft"
            >
              <div>
                <p className="text-[15px] font-medium text-ink">
                  Forensic recovery
                </p>
                <p className="text-[13px] text-body-muted">
                  Carve and recover files from a verified image
                </p>
              </div>
              <span className="text-recovery text-sm font-medium">Start</span>
            </Link>
          </div>
        </DataCard>

        <DataCard className="p-0">
          <div className="border-b border-hairline px-5 py-3">
            <p className="text-[13px] font-medium text-body-muted">
              Device risk summary
            </p>
          </div>
          <div className="flex flex-col divide-y divide-hairline">
            {flaggedDevices.length === 0 && (
              <p className="px-5 py-4 text-sm text-body-muted">
                No devices currently carry sanitization limitations.
              </p>
            )}
            {flaggedDevices.map((d) => (
              <div key={d.id} className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-medium text-ink">
                    {d.model} · {d.type}
                  </p>
                  <StatusBadge label="Limited assurance" tone="warning" />
                </div>
                <p className="mt-1 text-[13px] text-body-muted">
                  {plans[d.id]?.limitations}
                </p>
              </div>
            ))}
          </div>
        </DataCard>
      </section>

      <section>
        <SectionHeading
          title="Recent jobs"
          action={
            <Link
              href="/erase/new"
              className="text-[13px] font-medium text-primary hover:text-primary-active"
            >
              View all →
            </Link>
          }
        />
        <DataCard className="p-0">
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className="border-b border-hairline text-[12px] uppercase tracking-wide text-body-muted">
                <th className="px-5 py-3 font-medium">Job</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Device</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-5 py-3">
                    <Link
                      href={
                        job.type === "ERASE"
                          ? `/erase/${job.id}`
                          : `/recover/${job.id}`
                      }
                      className="font-mono text-[13px] text-primary hover:underline"
                    >
                      {job.id}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-body">{job.type}</td>
                  <td className="px-5 py-3 text-body">
                    {job.device?.model ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge
                      label={jobStatusLabel(job.status)}
                      tone={jobStatusTone(job.status)}
                    />
                  </td>
                  <td className="px-5 py-3 text-body-muted">
                    {new Date(job.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      </section>

      <section>
        <SectionHeading
          title="Recent certificates"
          action={
            <Link
              href="/certificates"
              className="text-[13px] font-medium text-primary hover:text-primary-active"
            >
              View all →
            </Link>
          }
        />
        <DataCard className="p-0">
          <div className="flex flex-col divide-y divide-hairline">
            {certificates.map((cert) => (
              <Link
                key={cert.id}
                href={`/certificates/${cert.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-canvas-soft"
              >
                <div>
                  <p className="text-[14px] font-medium text-ink">
                    {cert.id}
                  </p>
                  <p className="text-[13px] text-body-muted">
                    {cert.method} · {cert.standard}
                  </p>
                </div>
                <StatusBadge
                  label={cert.verificationResult ? "Verified" : "Failed"}
                  tone={cert.verificationResult ? "success" : "destructive"}
                />
              </Link>
            ))}
          </div>
        </DataCard>
      </section>
    </div>
  );
}
