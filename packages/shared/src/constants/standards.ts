export const ERASURE_STANDARDS = [
  "NIST_SP_800_88",
  "IEEE_2883",
  "CUSTOM",
] as const;

export type ErasureStandard = (typeof ERASURE_STANDARDS)[number];
