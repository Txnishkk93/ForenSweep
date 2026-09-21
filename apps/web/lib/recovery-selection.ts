import type { AvailableImage, Certificate } from "./types";

export type RecoverySelectionInput = {
  images: AvailableImage[];
  certificates: Certificate[];
  searchParams?: Record<string, string | string[] | undefined>;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function archiveStem(filename: string): string {
  return filename
    .replace(/\.forensic\.zip$/i, "")
    .replace(/\.img$/i, "")
    .toLowerCase();
}

export function findArchiveForCertificate(
  images: AvailableImage[],
  certificate: Pick<Certificate, "jobId" | "targetDisplayName">,
) {
  const tokens = new Set<string>();
  const targetDisplayName = normalizeText(certificate.targetDisplayName);
  if (targetDisplayName) {
    tokens.add(targetDisplayName);
    tokens.add(targetDisplayName.replace(/\.[a-z0-9]+$/i, ""));
  }
  if (certificate.jobId) {
    tokens.add(certificate.jobId.slice(0, 8).toLowerCase());
  }

  return images.find((image) => {
    const filename = image.filename.toLowerCase();
    const stem = archiveStem(image.filename);
    return Array.from(tokens).some((token) => Boolean(token) && (filename.includes(token) || stem.includes(token)));
  });
}

export function resolveRecoverySelection({
  images,
  certificates,
  searchParams,
}: RecoverySelectionInput) {
  const params = searchParams ?? {};
  const rawArchiveId = Array.isArray(params.archiveId) ? params.archiveId[0] : params.archiveId;
  const rawCertificateId = Array.isArray(params.certificateId) ? params.certificateId[0] : params.certificateId;

  const selectedArchiveById = rawArchiveId ? images.find((image) => image.id === rawArchiveId) ?? null : null;
  const selectedCertificateById = rawCertificateId ? certificates.find((certificate) => certificate.id === rawCertificateId) ?? null : null;

  let selectedArchive = selectedArchiveById;
  let selectedCertificate = selectedCertificateById;

  if (!selectedArchive && selectedCertificate) {
    selectedArchive = findArchiveForCertificate(images, selectedCertificate) ?? null;
  }

  if (!selectedCertificate && selectedArchive) {
    const archiveName = archiveStem(selectedArchive.filename);
    selectedCertificate = certificates.find((certificate) => {
      const targetName = normalizeText(certificate.targetDisplayName);
      return Boolean(targetName) && (archiveName.includes(targetName) || targetName.includes(archiveName));
    }) ?? null;
  }

  if (!selectedArchive && !selectedCertificate && rawArchiveId === undefined && rawCertificateId === undefined) {
    return { acquisitionId: "", authorizationCertificateId: "", selectedArchive: null, selectedCertificate: null };
  }

  return {
    acquisitionId: selectedArchive?.id ?? "",
    authorizationCertificateId: selectedCertificate?.id ?? "",
    selectedArchive,
    selectedCertificate,
  };
}
