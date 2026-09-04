export const ERASE_METHODS = [
  "OVERWRITE_SINGLE",
  "OVERWRITE_MULTI",
  "ATA_SECURE_ERASE",
  "NVME_SECURE_FORMAT",
  "CRYPTO_ERASE",
  "FILE_LEVEL_OVERWRITE",
] as const;

export type EraseMethod = (typeof ERASE_METHODS)[number];
