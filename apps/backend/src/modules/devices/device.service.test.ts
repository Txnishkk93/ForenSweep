import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { browseDevice } from "./device.service.js";

function storeFor(path: string, mounted = true) {
  const device = {
    id: "00000000-0000-4000-8000-000000000111",
    path,
    type: "USB" as const,
    model: "Test device",
    serial: "test-serial",
    sizeBytes: 1000n,
    supportsAta: false,
    supportsNvme: false,
    supportsSed: false,
    mounted,
    isSystemDisk: false,
    capabilitySnapshot: {},
    lastSeenAt: new Date(),
  };
  return {
    device: {
      findUnique: async () => device,
    },
    auditLog: {},
  } as never;
}

test("browseDevice lists a bounded, directories-first view", async () => {
  const root = await mkdtemp(join(tmpdir(), "forensweep-browse-"));
  try {
    await mkdir(join(root, "alpha"));
    await writeFile(join(root, "zeta.txt"), "test");
    const result = await browseDevice("device", undefined, storeFor(root));
    assert.deepEqual(result.entries.map((entry) => entry.name), ["alpha", "zeta.txt"]);
    assert.equal(result.entries[0]?.type, "directory");
    assert.equal(result.parentPath, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("browseDevice rejects traversal outside the device root", async () => {
  const root = await mkdtemp(join(tmpdir(), "forensweep-browse-"));
  try {
    await assert.rejects(
      browseDevice("device", "../../etc", storeFor(root)),
      (error: { statusCode?: number; code?: string }) =>
        error.statusCode === 400 && error.code === "INVALID_DEVICE_PATH",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("browseDevice omits symlinks that escape the device root", async () => {
  const root = await mkdtemp(join(tmpdir(), "forensweep-browse-"));
  const outside = await mkdtemp(join(tmpdir(), "forensweep-outside-"));
  try {
    await writeFile(join(outside, "secret.txt"), "secret");
    try {
      await symlink(outside, join(root, "outside"), "junction");
    } catch {
      return;
    }
    const result = await browseDevice("device", undefined, storeFor(root));
    assert.equal(result.entries.some((entry) => entry.name === "outside"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
