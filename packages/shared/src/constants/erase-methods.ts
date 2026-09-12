export const ERASE_METHODS = [
  "DESTROY",
  "OVERWRITE_SINGLE",
  "OVERWRITE_MULTI",
  "ATA_SECURE_ERASE",
  "NVME_SECURE_FORMAT",
  "CRYPTO_ERASE",
  "FILE_LEVEL_OVERWRITE",
] as const;

export type EraseMethod = (typeof ERASE_METHODS)[number];

export const SANITIZATION_TIERS = [
  "CRYPTOGRAPHIC_ERASE",
  "FIRMWARE_SECURE_ERASE",
  "OVERWRITE",
] as const;

export type SanitizationTier = (typeof SANITIZATION_TIERS)[number];
