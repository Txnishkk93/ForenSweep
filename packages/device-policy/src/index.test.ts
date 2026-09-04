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
  lastSeenAt: "2026-09-04T00:00:00.000Z",
  ...overrides,
});

test("recommends overwrite for a whole HDD", () => {
  assert.equal(
    evaluateDevicePolicy({ device: device({}), eraseScope: "WHOLE_DRIVE" })
      .recommendedMethod,
    "OVERWRITE_MULTI",
  );
});

test("rejects software overwrite requests for NVMe", () => {
  const result = evaluateDevicePolicy({
    device: device({ type: "SSD", interface: "NVME", supportsNvme: true }),
    eraseScope: "WHOLE_DRIVE",
    requestedMethod: "OVERWRITE_SINGLE",
  });
  assert.equal(result.allowedInSimulationMode, false);
  assert.equal(result.recommendedMethod, "NVME_SECURE_FORMAT");
});

test("flags flash media assurance limitations", () => {
  const result = evaluateDevicePolicy({
    device: device({ type: "USB", interface: "USB" }),
    eraseScope: "WHOLE_DRIVE",
  });
  assert.equal(result.riskLevel, "HIGH");
  assert.equal(result.warnings.length, 2);
});
