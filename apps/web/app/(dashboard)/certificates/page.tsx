"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataCard, SectionHeading } from "@/components/Primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { getCertificatesFromJobs, getJobs } from "@/lib/backend-api";
import type { Certificate } from "@/lib/types";

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJobs()
      .then(getCertificatesFromJobs)
      .then(setCertificates)
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load certificates.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl">
      <SectionHeading eyebrow="Chain of custody" title="Certificates" />
      {loading && <p className="mb-4 text-sm text-body-muted">Loading certificates...</p>}
      {error && <p className="mb-4 text-sm text-destructive-active">{error}</p>}
      <DataCard className="p-0">
        <table className="w-full text-left text-[14px]">
          <thead>
            <tr className="border-b border-hairline text-[12px] uppercase tracking-wide text-body-muted">
              <th className="px-5 py-3 font-medium">Certificate</th>
              <th className="px-5 py-3 font-medium">Method</th>
              <th className="px-5 py-3 font-medium">Standard</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Issued</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {certificates.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-3">
                  <Link
                    href={`/certificates/${c.id}`}
                    className="font-mono text-[13px] text-primary hover:underline"
                  >
                    {c.id}
                  </Link>
                </td>
                <td className="px-5 py-3 text-body">{c.method}</td>
                <td className="px-5 py-3 text-body">{c.standard}</td>
                <td className="px-5 py-3">
                  <StatusBadge
                    label={c.verificationResult ? "Verified" : "Failed"}
                    tone={c.verificationResult ? "success" : "destructive"}
                  />
                </td>
                <td className="px-5 py-3 text-body-muted">
                  {new Date(c.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataCard>
    </div>
  );
}
