import type { DeviceProfile, EraseMethod } from "@repo/shared";

export type EraseScope = "WHOLE_DRIVE" | "SPECIFIC_FILES";
export type PolicyRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type DevicePolicyInput = {
  device: DeviceProfile;
  eraseScope: EraseScope;
  requestedMethod?: EraseMethod;
};

export type DevicePolicyDecision = {
  recommendedMethod: EraseMethod;
  sanitizationLabel: string;
  riskLevel: PolicyRiskLevel;
  warnings: string[];
  requiresApproval: boolean;
  allowedInSimulationMode: boolean;
};

const unsafeFlashMethods = new Set<EraseMethod>([
  "OVERWRITE_SINGLE",
  "OVERWRITE_MULTI",
]);

export function evaluateDevicePolicy({
  device,
  eraseScope,
  requestedMethod,
}: DevicePolicyInput): DevicePolicyDecision {
  if (eraseScope === "SPECIFIC_FILES") {
    return {
      recommendedMethod: "FILE_LEVEL_OVERWRITE",
      sanitizationLabel: "Logical file-level overwrite",
      riskLevel: "HIGH",
      warnings: [
        "File-level overwrite cannot guarantee removal of remnant data or filesystem metadata.",
      ],
      requiresApproval: true,
      allowedInSimulationMode: true,
    };
  }

  if (device.supportsSed) {
    return decision(
      "CRYPTO_ERASE",
      "Self-encrypting drive cryptographic erase",
      "MEDIUM",
      [
        "Cryptographic erase depends on correct device key-management behavior.",
      ],
      requestedMethod,
    );
  }

  if (device.interface === "NVME" || device.supportsNvme) {
    return decision(
      "NVME_SECURE_FORMAT",
      "NVMe sanitize or secure format",
      "MEDIUM",
      ["NVMe sanitize support and completion must be verified by the worker."],
      requestedMethod,
      unsafeFlashMethods.has(requestedMethod ?? "NVME_SECURE_FORMAT"),
    );
  }

  if (
    device.type === "SSD" &&
    (device.interface === "SATA" || device.supportsAta)
  ) {
    return decision(
      "ATA_SECURE_ERASE",
      "ATA secure erase",
      "MEDIUM",
      [
        "ATA secure erase support and completion must be verified by the worker.",
      ],
      requestedMethod,
      unsafeFlashMethods.has(requestedMethod ?? "ATA_SECURE_ERASE"),
    );
  }

  if (
    device.type === "USB" ||
    device.type === "SD_CARD" ||
    device.interface === "USB" ||
    device.interface === "SD_CARD"
  ) {
    return decision(
      "OVERWRITE_SINGLE",
      "Software overwrite with limited assurance",
      "HIGH",
      [
        "Flash translation layers may retain inaccessible remnant data.",
        "Software overwrite cannot provide hardware-level sanitization assurance.",
      ],
      requestedMethod,
    );
  }

  return decision(
    "OVERWRITE_MULTI",
    "Whole-drive multi-pass overwrite",
    "MEDIUM",
    [
      "Verification must confirm the complete addressable media range was processed.",
    ],
    requestedMethod,
  );
}

function decision(
  recommendedMethod: EraseMethod,
  sanitizationLabel: string,
  riskLevel: PolicyRiskLevel,
  warnings: string[],
  requestedMethod?: EraseMethod,
  unsafeRequest = false,
): DevicePolicyDecision {
  const rejected =
    unsafeRequest ||
    (requestedMethod !== undefined && requestedMethod !== recommendedMethod);
  const allWarnings = [...warnings];

  if (unsafeRequest) {
    allWarnings.push(
      "The requested overwrite method is unsafe for this device class and was rejected.",
    );
  } else if (
    requestedMethod !== undefined &&
    requestedMethod !== recommendedMethod
  ) {
    allWarnings.push(
      `Requested method ${requestedMethod} does not match the recommended method ${recommendedMethod}.`,
    );
  }

  return {
    recommendedMethod,
    sanitizationLabel,
    riskLevel: rejected ? "HIGH" : riskLevel,
    warnings: allWarnings,
    requiresApproval: rejected || riskLevel === "HIGH",
    allowedInSimulationMode: !unsafeRequest,
  };
}
