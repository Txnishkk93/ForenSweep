"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataCard, MonoText, SectionHeading } from "@/components/Primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/Button";
import { getDevice, getDeviceProfile, profileToPlan } from "@/lib/backend-api";
import { formatBytes } from "@/lib/status-colors";
import type { Device, SanitizationPlan } from "@/lib/types";

export default function DeviceDetailPage({
  params,
}: {
  params: { deviceId: string };
}) {
  const [device, setDevice] = useState<Device | null>(null);
  const [plan, setPlan] = useState<SanitizationPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getDevice(params.deviceId), getDeviceProfile(params.deviceId)])
      .then(([loadedDevice, profile]) => {
        setDevice(loadedDevice);
        setPlan(profileToPlan(profile));
      })
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "Unable to load device."),
      );
  }, [params.deviceId]);

  if (error) return <p className="text-sm text-destructive-active">{error}</p>;
  if (!device) return <p className="text-sm text-body-muted">Loading device...</p>;

  return (
    <div className="max-w-3xl">
      <SectionHeading eyebrow="Device profile" title={device.model ?? device.path} />

      <DataCard className="mb-6">
        <div className="grid grid-cols-2 gap-4 text-[14px]">
          <div>
            <p className="text-body-muted">Device path</p>
            <MonoText className="mt-1">{device.path}</MonoText>
          </div>
          <div>
            <p className="text-body-muted">Serial</p>
            <MonoText className="mt-1">{device.serial}</MonoText>
          </div>
          <div>
            <p className="text-body-muted">Capacity</p>
            <p className="mt-1 text-ink">{formatBytes(device.sizeBytes)}</p>
          </div>
          <div>
            <p className="text-body-muted">Type</p>
            <p className="mt-1 text-ink">{device.type}</p>
          </div>
        </div>
        <div className="mt-4 flex gap-1.5">
          {device.mounted && <StatusBadge label="Mounted" tone="warning" />}
          {device.isSystemDisk && (
            <StatusBadge label="System disk" tone="destructive" />
          )}
          {device.supportsSed && (
            <StatusBadge label="Self-encrypting" tone="info" />
          )}
        </div>
      </DataCard>

      {plan && (
        <DataCard>
          <p className="text-[13px] font-medium text-body-muted">
            Recommended sanitization
          </p>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-[18px] font-medium text-ink">{plan.method}</p>
            <StatusBadge label={`NIST: ${plan.nistCategory}`} tone="info" />
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-body">
            {plan.justification}
          </p>
          {plan.limitations && (
            <div className="mt-4 rounded border border-warning/30 bg-warning-soft p-4">
              <p className="text-[13px] font-medium text-warning">
                Limitation
              </p>
              <p className="mt-1 text-[13px] text-warning">
                {plan.limitations}
              </p>
            </div>
          )}
        </DataCard>
      )}

      <div className="mt-6 flex gap-3">
        <Link href={`/erase/new?deviceId=${device.id}`}>
          <Button variant="destructive">Start secure erasure</Button>
        </Link>
        <Link href="/devices">
          <Button variant="secondary">Back to inventory</Button>
        </Link>
      </div>
    </div>
  );
}
