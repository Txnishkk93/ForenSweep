"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ShieldAlert, RotateCw, ShieldCheck, Search, Bell, Sun, ChevronRight, Plus } from "lucide-react";
import { DataCard, SectionHeading } from "@/components/Primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { getDeviceProfile, getDevices, getJobSummary, getJobs, profileToPlan } from "@/lib/backend-api";
import { eraseMethodLabel, jobStatusLabel, jobStatusTone } from "@/lib/status-colors";
import type { JobStatus, SanitizationPlan } from "@/lib/types";
import { ExpandableSection } from "@/components/ExpandableSection";

const CARD_SHADOW =
  "shadow-[0_1px_2px_0_rgba(0,0,0,0.05),0_0_0_1px_rgba(0,0,0,0.06)]";

/**
 * Real elapsed-time formatter — used for "Last refreshed" so that text is
 * never fabricated. Feeds off react-query's own `dataUpdatedAt` timestamps,
 * not a hardcoded string like the mockup's "2 min ago".
 */
function formatRelativeTime(timestampMs: number): string {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export default function DashboardPage() {
  const { data: jobs = [], error: jobsError, dataUpdatedAt: jobsUpdatedAt } = useQuery({ queryKey: ["jobs"], queryFn: getJobs });
  const { data: devices = [], error: devicesError, dataUpdatedAt: devicesUpdatedAt } = useQuery({ queryKey: ["devices"], queryFn: getDevices });
  const { data: jobSummary = {}, error: summaryError, dataUpdatedAt: summaryUpdatedAt } = useQuery({ queryKey: ["job-summary"], queryFn: getJobSummary });
  const profileQueries = useQueries({
    queries: devices.map((device) => ({
      queryKey: ["device-profile", device.id],
      queryFn: () => getDeviceProfile(device.id),
    })),
  });

  const [newOperationOpen, setNewOperationOpen] = useState(false);
  const [, setClock] = useState(Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const lastRefreshedAt = Math.max(jobsUpdatedAt, devicesUpdatedAt, summaryUpdatedAt);

  const nextQueuedJob = jobs.find((job) => job.status === "QUEUED");

  const counts: { status: JobStatus; label: string; alert?: boolean }[] = [
    { status: "QUEUED", label: "Queued" },
    { status: "RUNNING", label: "Running" },
    { status: "COMPLETED", label: "Completed" },
    { status: "FAILED", label: "Failed", alert: true },
  ];

  const plans = Object.fromEntries(
    devices.flatMap((device, index) => {
      const profile = profileQueries[index]?.data;
      return profile ? [[device.id, profileToPlan(profile)]] : [];
    }),
  ) as Record<string, SanitizationPlan>;
  const flaggedDevices = devices.filter((device) => plans[device.id]?.limitations);

  const error = jobsError ?? devicesError ?? summaryError;

  return (
    <>
      {/*
        Top bar — breadcrumb / search / bell / theme toggle.
        NOTE: this is global chrome, not page-specific content. If your app
        has a shared layout (e.g. app/(dashboard)/layout.tsx) that wraps
        every authenticated page, this block belongs there instead of here
        so it doesn't get duplicated per-page. Left inline for now since
        only this page's code was provided — move it up one level once you
        confirm the layout structure.
      */}
      <header className="flex h-[54px] items-center justify-between border-b border-hairline bg-[#f5f5f6] px-9">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5">
          <span className="text-xs text-body-muted">ForenSweep</span>
          <ChevronRight className="h-3 w-3 text-black" aria-hidden="true" />
          <span className="text-xs font-medium text-ink">Dashboard</span>
        </nav>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-body-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Search..."
              className="w-48 rounded-[7px] border border-hairline bg-white py-[5px] pl-8 pr-12 text-xs text-ink placeholder:text-body-muted focus:outline-none focus:ring-2 focus:ring-ink/10"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-hairline bg-canvas-soft px-1 py-0.5 text-[10px] text-body-muted">
              ⌘K
            </kbd>
          </div>
          <button
            type="button"
            aria-label="Notifications"
            className="flex h-8 w-8 items-center justify-center rounded-[7px] border border-hairline bg-white text-body-muted hover:bg-canvas-soft"
          >
            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Toggle theme"
            className="flex h-8 w-8 items-center justify-center rounded-[7px] border border-hairline bg-white text-body-muted hover:bg-canvas-soft"
          >
            <Sun className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="flex max-w-5xl flex-col gap-8 p-9">
        {/* Page heading */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-body-muted">
              Overview
            </p>
            <h1 className="text-[26px] font-bold leading-none tracking-[-0.03em] text-ink">
              Dashboard
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {lastRefreshedAt > 0 && (
              <span className="text-[11.5px] text-body-muted">
                Last refreshed {formatRelativeTime(lastRefreshedAt)}
              </span>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setNewOperationOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={newOperationOpen}
                className="flex items-center gap-1.5 rounded-[7px] bg-ink px-3.5 py-[6px] text-xs font-medium text-white hover:bg-ink/90"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                New operation
              </button>

              {newOperationOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-10 mt-1.5 w-48 rounded-lg border border-hairline bg-white py-1 shadow-lg"
                >
                  <Link
                    href="/erase/new"
                    role="menuitem"
                    onClick={() => setNewOperationOpen(false)}
                    className="block px-3.5 py-2 text-[13px] text-ink hover:bg-canvas-soft"
                  >
                    Secure erasure
                  </Link>
                  <Link
                    href="/recover/new"
                    role="menuitem"
                    onClick={() => setNewOperationOpen(false)}
                    className="block px-3.5 py-2 text-[13px] text-ink hover:bg-canvas-soft"
                  >
                    Forensic recovery
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-destructive-active/20 bg-destructive-soft px-4 py-3 text-sm text-destructive-active">
            {error instanceof Error ? error.message : "Unable to load dashboard data."}
          </p>
        )}

        {/* Stat row */}
        <section>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {counts.map((c) => {
              const value = jobSummary[c.status] ?? 0;
              const showRunningDot = c.status === "RUNNING" && value > 0;
              return (
                <DataCard
                  key={c.status}
                  className={`relative overflow-hidden px-[22px] py-5 ${CARD_SHADOW}`}
                >
                  {c.alert && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0 h-0.5 bg-[#fda4af]"
                    />
                  )}
                  <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-body-muted">
                    {c.label}
                  </p>
                  <p
                    className={`text-[34px] font-bold leading-none tracking-[-0.04em] tabular-nums ${c.alert ? "text-destructive-active" : "text-ink"
                      }`}
                  >
                    {value}
                  </p>

                  {c.status === "QUEUED" && nextQueuedJob && (
                    <p className="mt-2.5 text-[11.5px] text-body-muted">
                      Next: {nextQueuedJob.id}
                    </p>
                  )}
                  {showRunningDot && (
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500"
                      />
                      <span className="text-[11.5px] text-emerald-600">
                        Active now
                      </span>
                    </div>
                  )}
                </DataCard>
              );
            })}
          </div>
        </section>

        {/* Two-column: start operation / risk summary */}
        <section className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
          <DataCard className={`p-0 ${CARD_SHADOW}`}>
            <div className="border-b border-hairline px-5 py-3.5">
              <p className="text-[13.5px] font-semibold tracking-[-0.015em] text-ink">
                Start a new operation
              </p>
              <p className="mt-0.5 text-[11.5px] text-body-muted">
                Select an operation type to proceed
              </p>
            </div>

            <div className="flex flex-col divide-y divide-hairline">
              <Link
                href="/erase/new"
                className="flex items-center gap-3.5 px-5 py-[15px] transition-colors hover:bg-destructive-soft"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-destructive-soft text-destructive-active">
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-ink">
                    Secure erasure
                  </p>
                  <p className="truncate text-[11.5px] text-body-muted">
                    Sanitize a device or specific files
                  </p>
                </div>
                <span className="shrink-0 rounded-md border bg-ink px-[13px] py-[5px] text-xs font-semibold tracking-[0.01em] text-white">
                  Start
                </span>
              </Link>

              <Link
                href="/recover/new"
                className="flex items-center gap-3.5 px-5 py-[15px] transition-colors hover:bg-recovery-soft"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-recovery-soft text-recovery">
                  <RotateCw className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-ink">
                    Forensic recovery
                  </p>
                  <p className="truncate text-[11.5px] text-body-muted">
                    Carve and recover files from a verified image
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-ink px-[13px] py-[5px] text-xs font-semibold tracking-[0.01em] text-white">
                  Start
                </span>
              </Link>
            </div>

            <div className="flex items-center gap-1.5 border-t border-hairline px-5 py-[11px]">
              <ShieldCheck className="h-3.5 w-3.5 text-body-muted" aria-hidden="true" />
              <span className="text-[11px] text-body-muted">
                All operations are logged and tamper-evident
              </span>
            </div>
          </DataCard>

          <DataCard className={`p-0 ${CARD_SHADOW}`}>
            <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
              <div>
                <p className="text-[13.5px] font-semibold tracking-[-0.015em] text-ink">
                  Device risk summary
                </p>
                <p className="mt-0.5 text-[11.5px] text-body-muted">
                  Devices requiring immediate attention
                </p>
              </div>
              {flaggedDevices.length > 0 && (
                <StatusBadge label={`${flaggedDevices.length} flagged`} tone="warning" />
              )}
            </div>

            <div className="max-h-[min(36rem,calc(100vh-20rem))] overflow-y-auto overscroll-contain divide-y divide-hairline">
              {flaggedDevices.length === 0 && (
                <p className="px-5 py-4 text-sm text-body-muted">
                  No devices currently carry sanitization limitations.
                </p>
              )}
              {flaggedDevices.map((d) => (
                <div key={d.id} className="px-5 py-[13px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12.5px] font-semibold tracking-[-0.01em] text-ink">
                      {d.id}
                    </span>
                    <StatusBadge label="Limited assurance" tone="warning" />
                    <span className="ml-auto shrink-0 text-[10.5px] text-body-muted">
                      {d.type}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-[1.55] text-body-muted">
                    {plans[d.id]?.limitations}
                  </p>
                </div>
              ))}
            </div>
          </DataCard>
        </section>

                {/* Recent jobs */}
        <section>
          <SectionHeading title="Recent jobs" />
          <DataCard className={`overflow-x-auto p-0 ${CARD_SHADOW}`}>
            <ExpandableSection
              visibleCount={3}
              totalCount={jobs.length}
              renderListAction={(expanded) => (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-hairline text-[10.5px] font-semibold uppercase tracking-[0.06em] text-body-muted">
                      <th className="px-5 py-3 font-semibold">Job</th>
                      <th className="px-5 py-3 font-semibold">Type</th>
                      <th className="px-5 py-3 font-semibold">Device</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {jobs.slice(0, expanded ? jobs.length : 3).map((job) => (
                      <tr key={job.id} className="transition-colors hover:bg-canvas-soft">
                        <td className="px-5 py-3">
                          <Link
                            href={
                              job.type === "ERASE"
                                ? `/erase/${job.id}`
                                : `/recover/${job.id}`
                            }
                            className="font-mono text-[12.5px] font-semibold tracking-[-0.01em] text-primary hover:underline"
                          >
                            {job.id}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-[13px] text-body">{job.type}</td>
                        <td className="px-5 py-3 text-[13px] text-body">
                          {job.device?.model ?? "—"}
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge
                            label={jobStatusLabel(job.status)}
                            tone={jobStatusTone(job.status)}
                          />
                        </td>
                        <td className="px-5 py-3 text-[11.5px] text-body-muted">
                          {new Date(job.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            />
          </DataCard>
        </section>

        {/* Recent certificates */}
        <section>
          <SectionHeading title="Recent certificates" />
          <DataCard className={`p-0 ${CARD_SHADOW}`}>
            {(() => {
              const certJobs = jobs.filter((job) => job.certificate);
              return (
                <ExpandableSection
                  visibleCount={3}
                  totalCount={certJobs.length}
                  renderListAction={(expanded) => (
                    <div className="flex flex-col divide-y divide-hairline">
                      {certJobs.slice(0, expanded ? certJobs.length : 3).map((job) => {
                        const cert = job.certificate!;
                        return (
                          <Link
                            key={cert.id}
                            href={`/certificates/${cert.id}`}
                              className="flex items-center justify-between gap-3 px-5 py-[15px] transition-colors hover:bg-canvas-soft"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[12.5px] font-semibold tracking-[-0.01em] text-ink">
                                {cert.targetDisplayName ?? `Certificate from ${new Date(cert.createdAt).toLocaleDateString()}`}
                              </p>
                              <p className="mt-0.5 font-mono text-[11px] text-body-muted">
                                {cert.id}
                              </p>
                              <p className="mt-0.5 text-[11.5px] text-body-muted">
                                {eraseMethodLabel(cert.method)} · {cert.standard}
                              </p>
                            </div>
                            <StatusBadge
                              label={cert.verificationResult ? "Verified" : "Failed"}
                              tone={cert.verificationResult ? "success" : "destructive"}
                            />
                          </Link>
                        );
                      })}
                    </div>
                  )}
                />
              );
            })()}
          </DataCard>
        </section>
      </div>
    </>
  );
}