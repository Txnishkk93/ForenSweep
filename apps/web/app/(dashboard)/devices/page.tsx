"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { DataCard, SectionHeading, MonoText } from "@/components/Primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { getDevices } from "@/lib/backend-api";
import { formatBytes } from "@/lib/status-colors";
import type { Device, DeviceType } from "@/lib/types";

const TYPE_LABEL: Record<DeviceType, string> = {
  HDD: "HDD",
  SSD: "SSD",
  USB: "USB",
  SD_CARD: "SD Card",
  UNKNOWN: "Unknown",
};

export default function DevicesPage() {
  const { data: devices = [], isLoading: loading, error } = useQuery({
    queryKey: ["devices"],
    queryFn: getDevices,
  });

  return (
    <div className="max-w-5xl">
      <SectionHeading
        eyebrow="Inventory"
        title="Connected devices"
      />
      {loading && <p className="mb-4 text-sm text-body-muted">Loading devices...</p>}
      {error && <p className="mb-4 text-sm text-destructive-active">{error instanceof Error ? error.message : "Unable to load devices."}</p>}
      <DataCard className="p-0">
        <table className="w-full text-left text-[14px]">
          <thead>
            <tr className="border-b border-hairline text-[12px] uppercase tracking-wide text-body-muted">
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Model</th>
              <th className="px-5 py-3 font-medium">Serial</th>
              <th className="px-5 py-3 font-medium">Capacity</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {devices.map((d) => (
              <tr key={d.id}>
                <td className="px-5 py-3">
                  <StatusBadge label={TYPE_LABEL[d.type]} tone="neutral" />
                </td>
                <td className="px-5 py-3 text-ink">{d.model}</td>
                <td className="px-5 py-3">
                  <MonoText>{d.serial}</MonoText>
                </td>
                <td className="px-5 py-3 text-body">
                  {formatBytes(d.sizeBytes)}
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-1.5">
                    {d.mounted && (
                      <StatusBadge label="Mounted" tone="warning" />
                    )}
                    {d.isSystemDisk && (
                      <StatusBadge label="System disk" tone="destructive" />
                    )}
                    {!d.mounted && !d.isSystemDisk && (
                      <StatusBadge label="Available" tone="success" />
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-right">
                  <Link
                    href={`/devices/${d.id}`}
                    className="text-[13px] font-medium text-primary hover:text-primary-active"
                  >
                    View profile →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataCard>
    </div>
  );
}
