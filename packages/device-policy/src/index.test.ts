import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { DeviceProfile } from "@repo/shared";
import { evaluateDevicePolicy } from "./index.js";

const device = (overrides: Partial<DeviceProfile>): DeviceProfile => ({
  id: "00000000-0000-4000-8000-000000000001",
  type: "HDD",
  interface: "UNKNOWN",
  model: null,
  serial: null,
  sizeBytes: "1000",
  supportsAta: false,
  supportsNvme: false,
  supportsSed: false,
  supportsCryptoErase: false,
  supportsSecureErase: false,
  isSsd: false,
  respondsToCommands: true,
  lastSeenAt: "2026-09-04T00:00:00.000Z",
  ...overrides,
});

test("recommends overwrite for a whole HDD", () => {
  assert.equal(
    evaluateDevicePolicy({ device: device({}), eraseScope: "WHOLE_DRIVE" })
      .recommendedMethod,
    "OVERWRITE_SINGLE",
  );
});

test("rejects software overwrite requests for NVMe", () => {
  const result = evaluateDevicePolicy({
    device: device({ type: "SSD", interface: "NVME", supportsNvme: true, supportsSecureErase: true, isSsd: true }),
    eraseScope: "WHOLE_DRIVE",
    requestedMethod: "OVERWRITE_SINGLE",
  });
  assert.equal(result.allowedInSimulationMode, true);
  assert.equal(result.recommendedMethod, "NVME_SECURE_FORMAT");
});

test("flags flash media assurance limitations", () => {
  const result = evaluateDevicePolicy({
    device: device({ type: "USB", interface: "USB" }),
    eraseScope: "WHOLE_DRIVE",
  });
  assert.equal(result.riskLevel, "HIGH");
  assert.equal(result.recommendedMethod, "DESTROY");
});

test("prioritizes crypto erase over firmware erase", () => {
  const result = evaluateDevicePolicy({
    device: device({ type: "SSD", interface: "SATA", isSsd: true, supportsCryptoErase: true, supportsSecureErase: true }),
    eraseScope: "WHOLE_DRIVE",
  });
  assert.equal(result.recommendedMethod, "CRYPTO_ERASE");
  assert.equal(result.sanitizationTier, "CRYPTOGRAPHIC_ERASE");
});

test("uses firmware secure erase when crypto erase is unavailable", () => {
  const result = evaluateDevicePolicy({
    device: device({ type: "SSD", interface: "SATA", isSsd: true, supportsSecureErase: true }),
    eraseScope: "WHOLE_DRIVE",
  });
  assert.equal(result.recommendedMethod, "ATA_SECURE_ERASE");
  assert.equal(result.sanitizationTier, "FIRMWARE_SECURE_ERASE");
});

test("does not present SSD overwrite as strong sanitization", () => {
  const result = evaluateDevicePolicy({
    device: device({ type: "SSD", interface: "SATA", isSsd: true }),
    eraseScope: "WHOLE_DRIVE",
  });
  assert.equal(result.recommendedMethod, "DESTROY");
  assert.match(result.sanitizationLabel, /No strong software/);
});

test("allows a weaker manual method with an explicit warning", () => {
  const result = evaluateDevicePolicy({
    device: device({ type: "SSD", interface: "SATA", isSsd: true, supportsCryptoErase: true }),
    eraseScope: "WHOLE_DRIVE",
    requestedMethod: "OVERWRITE_SINGLE",
  });
  assert.equal(result.allowedInSimulationMode, true);
  assert.ok(result.warnings.some((warning) => warning.includes("Manual override")));
});
