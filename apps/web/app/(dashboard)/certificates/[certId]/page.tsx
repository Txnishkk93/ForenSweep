"use client";

import { useEffect, useState } from "react";
import { DataCard, MonoText, SectionHeading } from "@/components/Primitives";
import { Button } from "@/components/Button";
import { downloadCertificate, downloadCertificateExport, getCertificate, verifyCertificate } from "@/lib/backend-api";
import { ApiError } from "@/lib/api-client";
import type { Certificate } from "@/lib/types";
import { eraseMethodLabel } from "@/lib/status-colors";

export default function CertificateDetailPage({
  params,
}: {
  params: { certId: string };
}) {
  const [cert, setCert] = useState<Certificate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<"idle" | "downloading">("idle");
  const [exportState, setExportState] = useState<"idle" | "downloading">("idle");
  const [verifyState, setVerifyState] = useState<"idle" | "checking" | "valid" | "invalid">(
    "idle",
  );

  useEffect(() => {
    getCertificate(params.certId)
      .then(setCert)
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load certificate.",
        ),
      );
  }, [params.certId]);

  async function handleVerify() {
    if (!cert) return;
    setVerifyState("checking");
    try {
      const result = await verifyCertificate(cert);
      setVerifyState(result.valid ? "valid" : "invalid");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to verify certificate.",
      );
      setVerifyState("invalid");
    }
  }

  async function handleDownload() {
    if (!cert) return;
    setDownloadState("downloading");
    setError(null);
    try {
      const blob = await downloadCertificate(cert.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `forensweep-certificate-${cert.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 404)
        setError("Certificate file not found. Generate the certificate again.");
      else if (requestError instanceof ApiError && requestError.status >= 500)
        setError("The certificate service is temporarily unavailable. Try again.");
      else if (requestError instanceof Error)
        setError(requestError.message);
      else setError("Could not download certificate. Try again.");
    } finally {
      setDownloadState("idle");
    }
  }

  async function handleExportDownload() {
    if (!cert) return;
    setExportState("downloading");
    setError(null);
    try {
      const blob = await downloadCertificateExport(cert.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `forensweep-certificate-${cert.id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not export certificate.");
    } finally {
      setExportState("idle");
    }
  }

  if (error && !cert) {
    return <p className="text-sm text-destructive-active">{error}</p>;
  }
  if (!cert) {
    return <p className="text-sm text-body-muted">Loading certificate...</p>;
  }

  return (
    <div className="max-w-2xl">
      <SectionHeading
        eyebrow="Certificate"
        title={cert.targetDisplayName ?? `Certificate from ${new Date(cert.createdAt).toLocaleDateString()}`}
      />
      {error && <p className="mb-6 text-sm text-destructive-active">{error}</p>}

      <DataCard className="mb-6">
        <div className="mb-6 border-b border-hairline pb-5">
          <p className="text-body-muted">Reference ID</p>
          <MonoText className="mt-1 block w-fit">{cert.id}</MonoText>
          {cert.targetPaths && cert.targetPaths.length > 0 && (
            <div className="mt-4">
              <p className="text-body-muted">Target paths</p>
              <ul className="mt-2 space-y-1 text-[13px] text-ink">
                {cert.targetPaths.map((targetPath) => (
                  <li key={targetPath} className="break-all">{targetPath}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 text-[14px]">
          <div>
            <p className="text-body-muted">Method</p>
            <p className="mt-1 text-ink">{eraseMethodLabel(cert.method)}</p>
          </div>
          <div>
            <p className="text-body-muted">Standard</p>
            <p className="mt-1 text-ink">{cert.standard}</p>
          </div>
          <div>
            <p className="text-body-muted">Sanitization tier</p>
            <p className="mt-1 text-ink">{cert.sanitizationTier ?? "Not achieved"}</p>
          </div>
          {Array.isArray(cert.canonicalPayload?.limitations) && cert.canonicalPayload.limitations.length > 0 && (
            <div className="col-span-2 rounded border border-warning/30 bg-warning-soft p-3 text-[13px] text-warning">
              {(cert.canonicalPayload.limitations as unknown[]).filter((item): item is string => typeof item === "string").join(" ")}
            </div>
          )}
          <div>
            <p className="text-body-muted">Content hash</p>
            <MonoText className="mt-1 block w-fit">{cert.contentHash}</MonoText>
          </div>
          <div>
            <p className="text-body-muted">Previous certificate hash</p>
            <MonoText className="mt-1 block w-fit">
              {cert.prevCertHash ?? "GENESIS"}
            </MonoText>
          </div>
          <div className="col-span-2">
            <p className="text-body-muted">Signature</p>
            <MonoText className="mt-1 block w-fit">{cert.signature}</MonoText>
          </div>
        </div>
      </DataCard>

      <div className="flex items-center gap-3">
        <Button onClick={handleVerify} disabled={verifyState === "checking"}>
          {verifyState === "checking" ? "Verifying..." : "Verify certificate"}
        </Button>
        <Button variant="secondary" onClick={handleDownload} disabled={downloadState === "downloading"}>
          {downloadState === "downloading" ? "Downloading..." : "Download PDF"}
        </Button>
        <Button variant="secondary" onClick={handleExportDownload} disabled={exportState === "downloading"}>
          {exportState === "downloading" ? "Exporting..." : "Download JSON export"}
        </Button>
      </div>

      {verifyState === "valid" && (
        <div className="mt-6 rounded-card border-2 border-success/40 bg-success-soft p-6 text-center">
          <p className="text-[18px] font-medium text-success">✓ Signature valid</p>
          <p className="mt-1 text-[13px] text-success">
            The content hash matches the record and the signature verifies
            against the issuing key.
          </p>
        </div>
      )}
      {verifyState === "invalid" && (
        <div className="mt-6 rounded-card border-2 border-destructive/40 bg-destructive-soft p-6 text-center">
          <p className="text-[18px] font-semibold text-destructive-active">
            ✗ Verification failed
          </p>
          <p className="mt-1 text-[13px] text-destructive-active">
            This certificate&apos;s content does not match its recorded hash
            and signature. Treat this record as tampered.
          </p>
        </div>
      )}
    </div>
  );
}
