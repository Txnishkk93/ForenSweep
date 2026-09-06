import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  detectDevices,
  normalizeMacDevice,
  normalizeWindowsDevices,
} from "./discovery.service.js";

test("macOS normalizes an internal mounted SSD as a system disk", () => {
  const device = normalizeMacDevice(
    {
      DeviceIdentifier: "disk0",
      MediaName: "APPLE SSD AP0512N",
      SerialNumber: "mac-serial",
      TotalSize: 512000000000,
      Internal: true,
      Removable: false,
      SolidState: true,
      BusProtocol: "PCI-Express",
      Protocol: "NVMe",
      MountPoint: "/",
    },
    "disk0",
  );
  assert.equal(device?.type, "SSD");
  assert.equal(device?.isSystemDisk, true);
  assert.equal(device?.mounted, true);
  assert.equal(device?.supportsNvme, true);
  assert.equal(device?.supportsSed, false);
});

test("macOS normalizes an external USB HDD as mounted only when it has a mount point", () => {
  const device = normalizeMacDevice(
    {
      DeviceIdentifier: "disk1",
      MediaName: "Portable USB HDD",
      SerialNumber: "usb-serial",
      Size: "1000000000",
      Internal: false,
      Removable: true,
      SolidState: false,
      BusProtocol: "USB",
      MountPoint: "",
    },
    "disk0",
  );
  assert.equal(device?.type, "USB");
  assert.equal(device?.isSystemDisk, false);
  assert.equal(device?.mounted, false);
  assert.equal(device?.capabilitySnapshot.transport, "usb");
});

test("Windows uses IsSystem and BusType directly for NVMe and external SSDs", () => {
  const devices = normalizeWindowsDevices(
    [
      { DeviceId: 0, FriendlyName: "NVMe System", SerialNumber: "nvme-1", Size: 1000, MediaType: "SSD", BusType: "NVMe" },
      { DeviceId: 1, FriendlyName: "USB SATA SSD", SerialNumber: "ssd-1", Size: 2000, MediaType: "SSD", BusType: "SATA" },
    ],
    [
      { Number: 0, IsBoot: true, IsSystem: true, OperationalStatus: ["Online"], PartitionStyle: "GPT" },
      { Number: 1, IsBoot: false, IsSystem: false, OperationalStatus: ["Online"], PartitionStyle: "GPT" },
    ],
    [{ DiskNumber: 0, DriveLetter: "C" }],
  );
  assert.equal(devices[0]?.type, "SSD");
  assert.equal(devices[0]?.supportsNvme, true);
  assert.equal(devices[0]?.isSystemDisk, true);
  assert.equal(devices[0]?.mounted, true);
  assert.equal(devices[1]?.supportsAta, true);
  assert.equal(devices[1]?.isSystemDisk, false);
  assert.equal(devices[1]?.mounted, false);
  assert.equal(devices[1]?.supportsSed, false);
});

test("unsupported platforms return an empty result", async () => {
  assert.deepEqual(await detectDevices("freebsd"), []);
});