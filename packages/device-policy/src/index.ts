import type { DeviceProfile, EraseMethod, SanitizationTier } from "@repo/shared";

export type EraseScope = "WHOLE_DRIVE" | "SPECIFIC_FILES";
export type PolicyRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type DevicePolicyInput = {
  device: DeviceProfile;
  eraseScope: EraseScope;
  requestedMethod?: EraseMethod;
};

export type DevicePolicyDecision = {
  recommendedMethod: EraseMethod;
  sanitizationTier: SanitizationTier | null;
  sanitizationLabel: string;
  riskLevel: PolicyRiskLevel;
  warnings: string[];
  requiresApproval: boolean;
  allowedInSimulationMode: boolean;
};

export function evaluateDevicePolicy({
  device,
  eraseScope,
  requestedMethod,
}: DevicePolicyInput): DevicePolicyDecision {
  if (eraseScope === "SPECIFIC_FILES") {
    return {
      recommendedMethod: "FILE_LEVEL_OVERWRITE",
      sanitizationLabel: "Logical file-level overwrite",
      sanitizationTier: "OVERWRITE",
      riskLevel: "HIGH",
      warnings: [
        "File-level overwrite cannot guarantee removal of remnant data or filesystem metadata.",
      ],
      requiresApproval: true,
      allowedInSimulationMode: true,
    };
  }

  if (!device.respondsToCommands) {
    return decision(
      "DESTROY",
      null,
      "Physical destruction required - the device does not respond to erase commands.",
      "HIGH",
      ["The controller is unresponsive; this device cannot be sanitized in place."],
      requestedMethod,
    );
  }

  if (device.supportsCryptoErase) {
    return decision(
      "CRYPTO_ERASE",
      "CRYPTOGRAPHIC_ERASE",
      "Self-encrypting drive cryptographic erase",
      "MEDIUM",
      [
        "Cryptographic erase depends on correct device key-management behavior.",
      ],
      requestedMethod,
    );
  }

  if (device.supportsSecureErase && (device.interface === "NVME" || device.supportsNvme)) {
    return decision(
      "NVME_SECURE_FORMAT",
      "FIRMWARE_SECURE_ERASE",
      "NVMe sanitize or secure format",
      "MEDIUM",
      ["NVMe sanitize support and completion must be verified by the worker."],
      requestedMethod,
    );
  }

  if (
    device.supportsSecureErase &&
    (device.interface === "SATA" || device.supportsAta)
  ) {
    return decision(
      "ATA_SECURE_ERASE",
      "FIRMWARE_SECURE_ERASE",
      "ATA secure erase",
      "MEDIUM",
      [
        "ATA secure erase support and completion must be verified by the worker.",
      ],
      requestedMethod,
    );
  }

  if (device.type === "HDD" && !device.isSsd) {
    return decision(
      "OVERWRITE_SINGLE",
      "OVERWRITE",
      "Software overwrite with limited assurance",
      "HIGH",
      ["Verification must confirm the complete addressable HDD range was processed."],
      requestedMethod,
    );
  }

  return decision(
    "DESTROY",
    null,
    "No strong software sanitization method is available for this SSD.",
    device.type === "USB" || device.type === "SD_CARD" ? "HIGH" : "MEDIUM",
    [
      device.type === "USB" || device.type === "SD_CARD"
        ? "Flash translation layers may retain inaccessible remnant data; physical destruction may be required."
        : "Do not use whole-device overwrite as an equivalent substitute for firmware secure erase on SSD media.",
    ],
    requestedMethod,
  );
}

function decision(
  recommendedMethod: EraseMethod,
  sanitizationTier: SanitizationTier | null,
  sanitizationLabel: string,
  riskLevel: PolicyRiskLevel,
  warnings: string[],
  requestedMethod?: EraseMethod,
  unsafeRequest = false,
): DevicePolicyDecision {
  const allWarnings = [...warnings];

  if (unsafeRequest) {
    allWarnings.push(
      "The requested overwrite method is unsafe for this device class and was rejected.",
    );
  } else if (requestedMethod !== undefined && requestedMethod !== recommendedMethod) {
    allWarnings.push(
      `Manual override ${requestedMethod} is weaker or different than the auto-recommended method ${recommendedMethod}.`,
    );
  }

  const rejected = unsafeRequest ||
    (requestedMethod === "DESTROY" && recommendedMethod !== "DESTROY") ||
    (recommendedMethod === "DESTROY" && requestedMethod !== undefined && requestedMethod !== "DESTROY");

  return {
    recommendedMethod,
    sanitizationTier,
    sanitizationLabel,
    riskLevel: rejected ? "HIGH" : riskLevel,
    warnings: allWarnings,
    requiresApproval: rejected || riskLevel === "HIGH",
    allowedInSimulationMode: !unsafeRequest,
  };
}
