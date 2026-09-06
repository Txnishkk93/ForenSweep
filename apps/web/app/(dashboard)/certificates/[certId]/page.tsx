"use client";

import { useEffect, useState } from "react";
import { DataCard, MonoText, SectionHeading } from "@/components/Primitives";
import { Button } from "@/components/Button";
import { getCertificate, verifyCertificate } from "@/lib/backend-api";
import type { Certificate } from "@/lib/types";

export default function CertificateDetailPage({
  params,
}: {
  params: { certId: string };
}) {
  const [cert, setCert] = useState<Certificate | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  if (error && !cert) {
    return <p className="text-sm text-destructive-active">{error}</p>;
  }
  if (!cert) {
    return <p className="text-sm text-body-muted">Loading certificate...</p>;
  }

  return (
    <div className="max-w-2xl">
      <SectionHeading eyebrow="Certificate" title={cert.id} />
      {error && <p className="mb-6 text-sm text-destructive-active">{error}</p>}

      <DataCard className="mb-6">
        <div className="grid grid-cols-2 gap-4 text-[14px]">
          <div>
            <p className="text-body-muted">Method</p>
            <p className="mt-1 text-ink">{cert.method}</p>
          </div>
          <div>
            <p className="text-body-muted">Standard</p>
            <p className="mt-1 text-ink">{cert.standard}</p>
          </div>
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
        <a href={cert.pdfPath} target="_blank" rel="noreferrer">
          <Button variant="secondary">Download PDF</Button>
        </a>
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
