import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { parse as parsePlist } from "plist";
import { deviceProfileSchema } from "@repo/shared";
import { prisma } from "../../lib/prisma.js";
import { safeReadCommand } from "../../lib/safe-exec.js";
import { AppError } from "../../middleware/error-handler.js";
import type { DeviceRecord } from "./device.service.js";

type Discovery = {
  path: string;
  type: DeviceRecord["type"];
  model: string | null;
  serial: string | null;
  sizeBytes: bigint | null;
  supportsAta: boolean;
  supportsNvme: boolean;
  supportsSed: boolean;
  supportsCryptoErase: boolean;
  supportsSecureErase: boolean;
  respondsToCommands: boolean;
  mounted: boolean;
  isSystemDisk: boolean;
  capabilitySnapshot: Record<string, unknown>;
};

type LsblkNode = {
  name?: string;
  path?: string;
  type?: string;
  model?: string | null;
  serial?: string | null;
  size?: string | number | null;
  rm?: boolean | number;
  ro?: boolean | number;
  tran?: string | null;
  rota?: boolean | number;
  mountpoint?: string | null;
  mountpoints?: Array<string | null> | null;
  children?: LsblkNode[];
};

let cache: { expiresAt: number; devices: Discovery[] } | null = null;
const CACHE_MS = 4000;

function sizeOf(value: unknown): bigint | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    return BigInt(String(value));
  } catch {
    return null;
  }
}

function validateDiscovery(device: Discovery): Discovery {
  const result = deviceProfileSchema.safeParse({
    id: randomUUID(),
    type: device.type,
    interface: device.supportsNvme
      ? "NVME"
      : device.supportsAta
        ? "SATA"
        : String(device.capabilitySnapshot.transport).toLowerCase() === "usb"
          ? "USB"
          : "UNKNOWN",
    model: device.model,
    serial: device.serial,
    sizeBytes: device.sizeBytes?.toString() ?? null,
    supportsAta: device.supportsAta,
    supportsNvme: device.supportsNvme,
    supportsSed: device.supportsSed,
    supportsCryptoErase: device.supportsCryptoErase,
    supportsSecureErase: device.supportsSecureErase,
    isSsd: device.type === "SSD",
    respondsToCommands: device.respondsToCommands,
    lastSeenAt: new Date().toISOString(),
  });
  if (!result.success) throw new Error(`Malformed device profile for ${device.path}`);
  return device;
}

function walk(node: LsblkNode): LsblkNode[] {
  return [node, ...(node.children ?? []).flatMap(walk)];
}

function pathFor(node: LsblkNode): string | null {
  const path = node.path ?? (node.name ? `/dev/${node.name}` : null);
  return path && /^\/dev\/[A-Za-z0-9._-]+$/.test(path) ? path : null;
}

function mounts(node: LsblkNode): string[] {
  return walk(node).flatMap((item) => [
    ...(item.mountpoints ?? []).filter((mount): mount is string => Boolean(mount)),
    ...(item.mountpoint ? [item.mountpoint] : []),
  ]);
}

function linuxType(node: LsblkNode): DeviceRecord["type"] {
  const transport = String(node.tran ?? "").toLowerCase();
  const model = String(node.model ?? "").toUpperCase();
  if (node.rota === 1 || node.rota === true) return "HDD";
  if (node.rota === 0 || node.rota === false || transport === "nvme" || /SSD|NVME/.test(model)) return "SSD";
  if (transport === "usb") return "USB";
  if (transport === "mmc") return "SD_CARD";
  return "UNKNOWN";
}

async function probeJson(command: string, args: string[], timeout = 5000): Promise<Record<string, unknown>> {
  try {
    const result = await safeReadCommand(command, args, timeout);
    if (result.code !== 0) return {};
    const parsed: unknown = JSON.parse(result.stdout);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function rootSource(): Promise<string | null> {
  try {
    const result = await safeReadCommand("findmnt", ["/", "-no", "SOURCE"]);
    return result.code === 0 ? result.stdout.trim() : null;
  } catch {
    return null;
  }
}

function linuxSystemDisk(node: LsblkNode, root: string | null): boolean {
  const paths = walk(node).map(pathFor).filter((path): path is string => path !== null);
  const mountpoints = mounts(node);
  return mountpoints.some((mount) => mount === "/" || mount === "/boot") || Boolean(root && paths.includes(root));
}

export async function scanLinux(): Promise<Discovery[]> {
  let result;
  try {
    result = await safeReadCommand("lsblk", ["-J", "-O"]);
  } catch {
    throw new AppError(503, "DEVICE_DISCOVERY_UNAVAILABLE", "lsblk is unavailable on this host");
  }
  if (result.code !== 0) throw new AppError(503, "DEVICE_DISCOVERY_FAILED", "lsblk failed during device discovery");
  let parsed: { blockdevices?: LsblkNode[] };
  try {
    parsed = JSON.parse(result.stdout) as { blockdevices?: LsblkNode[] };
  } catch {
    throw new AppError(503, "DEVICE_DISCOVERY_FAILED", "lsblk returned invalid JSON");
  }
  const root = await rootSource();
  const devices: Discovery[] = [];
  for (const node of parsed.blockdevices ?? []) {
    if (node.type !== "disk") continue;
    const path = pathFor(node);
    if (!path) continue;
    const transport = String(node.tran ?? "").toLowerCase();
    const smart = await probeJson("smartctl", ["-i", path]);
    const nvme = transport === "nvme" ? await probeJson("nvme", ["id-ctrl", path]) : {};
    const smartText = JSON.stringify(smart).toUpperCase();
    const nvmeText = JSON.stringify(nvme).toUpperCase();
    const supportsCryptoErase = smartText.includes("OPAL") || smartText.includes('"SED":TRUE');
    const supportsSecureErase =
      smartText.includes("SECURITY ERASE") ||
      smartText.includes('"SECURITY_SUPPORTED":TRUE') ||
      (transport === "nvme" && (nvmeText.includes("SANICAP") || nvmeText.includes("SANITIZE")));
    devices.push(validateDiscovery({
      path,
      type: linuxType(node),
      model: node.model ? String(node.model).trim() : null,
      serial: node.serial ? String(node.serial).trim() : null,
      sizeBytes: sizeOf(node.size),
      supportsAta: transport === "ata" || transport === "sata" || smartText.includes("ATA_VERSION"),
      supportsNvme: transport === "nvme" && Object.keys(nvme).length > 0,
      supportsSed: supportsCryptoErase,
      supportsCryptoErase,
      supportsSecureErase,
      respondsToCommands: Object.keys(smart).length > 0 || Object.keys(nvme).length > 0 || Boolean(node.model),
      mounted: mounts(node).length > 0,
      isSystemDisk: linuxSystemDisk(node, root),
      capabilitySnapshot: {
        transport: transport || "unknown",
        removable: node.rm === true || node.rm === 1,
        readOnly: node.ro === true || node.ro === 1,
        rotational: node.rota === true || node.rota === 1 ? true : node.rota === false || node.rota === 0 ? false : null,
        smartctl: smart,
        nvme,
        supportsCryptoErase,
        supportsSecureErase,
        respondsToCommands: Object.keys(smart).length > 0 || Object.keys(nvme).length > 0 || Boolean(node.model),
        rootSource: root,
      },
    }));
  }
  return devices;
}

function plistObject(output: string): Record<string, unknown> {
  const parsed = parsePlist(output) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("diskutil returned invalid plist");
  return parsed as Record<string, unknown>;
}

function plistString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeMacDevice(info: Record<string, unknown>, bootIdentifier: string | null): Discovery | null {
  const identifier = plistString(info.DeviceIdentifier);
  if (!identifier) return null;
  const protocol = String(info.BusProtocol ?? "").toUpperCase();
  const model = plistString(info.MediaName);
  const solidState = info.SolidState === true;
  const removable = info.Removable === true || info.Internal === false;
  const mountPoint = plistString(info.MountPoint);
  const isSystemDisk = mountPoint === "/" || mountPoint === "/boot" || identifier === bootIdentifier;
  const type: DeviceRecord["type"] = solidState
    ? "SSD"
    : protocol === "USB" && removable && /SD|FLASH|CARD/i.test(model ?? "")
      ? "SD_CARD"
      : protocol === "USB" && removable
        ? "USB"
        : "HDD";
  return validateDiscovery({
    path: `/dev/${identifier}`,
    type,
    model,
    serial: plistString(info.SerialNumber),
    sizeBytes: sizeOf(info.TotalSize ?? info.Size),
    supportsAta: protocol === "SATA",
    supportsNvme: protocol.includes("PCI-EXPRESS") && /NVME/i.test(`${info.Protocol ?? ""} ${model ?? ""}`),
    supportsSed: false,
    supportsCryptoErase: false,
    supportsSecureErase: false,
    respondsToCommands: true,
    mounted: Boolean(mountPoint),
    isSystemDisk,
    capabilitySnapshot: { transport: protocol.toLowerCase() || "unknown", removable, solidState, diskutil: info },
  });
}

export async function scanMacOS(): Promise<Discovery[]> {
  let listResult;
  try {
    listResult = await safeReadCommand("diskutil", ["list", "-plist"]);
  } catch {
    throw new AppError(503, "DEVICE_DISCOVERY_UNAVAILABLE", "diskutil is unavailable on this host");
  }
  if (listResult.code !== 0) throw new AppError(503, "DEVICE_DISCOVERY_FAILED", "diskutil list failed during device discovery");
  const list = plistObject(listResult.stdout);
  const identifiers = (list.AllDisks as unknown[] | undefined)?.filter((value): value is string => typeof value === "string") ?? [];
  let bootIdentifier: string | null = null;
  try {
    const boot = await safeReadCommand("diskutil", ["info", "-plist", "/"]);
    if (boot.code === 0) bootIdentifier = plistString(plistObject(boot.stdout).DeviceIdentifier);
  } catch { /* boot identity is best-effort; mountpoint checks remain */ }
  const devices: Discovery[] = [];
  for (const identifier of identifiers) {
    try {
      const result = await safeReadCommand("diskutil", ["info", "-plist", identifier]);
      if (result.code !== 0) continue;
      const device = normalizeMacDevice(plistObject(result.stdout), bootIdentifier);
      if (device) devices.push(device);
    } catch { /* one unavailable disk must not abort the scan */ }
  }
  return devices;
}

type PowerShellRecord = Record<string, unknown>;

function asRecords(value: unknown): PowerShellRecord[] {
  return Array.isArray(value) ? value.filter((item): item is PowerShellRecord => Boolean(item && typeof item === "object")) : value && typeof value === "object" ? [value as PowerShellRecord] : [];
}

function psBool(value: unknown): boolean { return value === true || String(value).toLowerCase() === "true"; }

export function normalizeWindowsDevices(
  physical: unknown,
  disks: unknown,
  partitions: unknown,
): Discovery[] {
  const diskRecords = asRecords(disks);
  const partitionRecords = asRecords(partitions);
  return asRecords(physical).flatMap((record) => {
    const deviceId = String(record.DeviceId ?? "");
    const disk = diskRecords.find((item) => String(item.Number ?? item.DiskNumber ?? "") === deviceId);
    const diskNumber = String(disk?.Number ?? deviceId);
    const mounted = partitionRecords.some((item) => String(item.DiskNumber ?? "") === diskNumber && Boolean(item.DriveLetter));
    const bus = String(record.BusType ?? "").toUpperCase();
    const media = String(record.MediaType ?? "").toUpperCase();
    if (!deviceId) return [];
    return [validateDiscovery({
      path: `\\\\.\\PhysicalDrive${deviceId}`,
      type: media === "SSD" ? "SSD" : media === "HDD" ? "HDD" : bus === "USB" ? "USB" : "UNKNOWN",
      model: typeof record.FriendlyName === "string" ? record.FriendlyName : null,
      serial: typeof record.SerialNumber === "string" ? record.SerialNumber.trim() || null : null,
      sizeBytes: sizeOf(record.Size),
      supportsAta: bus === "SATA" && media === "SSD",
      supportsNvme: bus === "NVME",
      supportsSed: false,
      supportsCryptoErase: false,
      supportsSecureErase: false,
      respondsToCommands: psBool(disk?.OperationalStatus) || String(disk?.OperationalStatus ?? "").toLowerCase() === "online",
      mounted,
      isSystemDisk: psBool(disk?.IsBoot) || psBool(disk?.IsSystem),
      capabilitySnapshot: { transport: bus.toLowerCase() || "unknown", removable: bus === "USB", mediaType: media, operationalStatus: disk?.OperationalStatus ?? null, partitionStyle: disk?.PartitionStyle ?? null },
    })];
  });
}

async function powershellJson(command: string): Promise<unknown> {
  const result = await safeReadCommand(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
    10000,
  );
  if (result.code !== 0) {
    const detail = result.stderr.trim() ? `: ${result.stderr.trim()}` : "";
    throw new Error(`PowerShell discovery command failed${detail}`);
  }
  return JSON.parse(result.stdout || "null") as unknown;
}

export async function scanWindows(): Promise<Discovery[]> {
  try {
    const physical = await powershellJson("Get-PhysicalDisk | Select-Object DeviceId,FriendlyName,SerialNumber,Size,MediaType,BusType,CanPool | ConvertTo-Json -Compress");
    const disks = await powershellJson("Get-Disk | Select-Object Number,IsBoot,IsSystem,OperationalStatus,PartitionStyle | ConvertTo-Json -Compress");
    const partitions = await powershellJson("Get-Partition | Select-Object DriveLetter,DiskNumber | ConvertTo-Json -Compress");
    return normalizeWindowsDevices(physical, disks, partitions);
  } catch (error) {
    console.warn(JSON.stringify({
      message: "windows_device_discovery_unavailable",
      detail: error instanceof Error ? error.message : "unknown error",
    }));
    return [];
  }
}

export async function detectDevices(platform = process.platform): Promise<Discovery[]> {
  if (platform === "linux") return scanLinux();
  if (platform === "darwin") return scanMacOS();
  if (platform === "win32") return scanWindows();
  console.warn(JSON.stringify({ message: "unsupported_device_discovery_platform", platform }));
  return [];
}

export async function scanAndPersistDevices(force = false): Promise<Discovery[]> {
  if (!force && cache && cache.expiresAt > Date.now()) return cache.devices;
  const devices = await detectDevices();
  for (const device of devices) {
    const existing = await prisma.device.findFirst({ where: { path: device.path }, select: { id: true } });
    const data = {
      path: device.path,
      type: device.type,
      model: device.model,
      serial: device.serial,
      sizeBytes: device.sizeBytes,
      supportsAta: device.supportsAta,
      supportsNvme: device.supportsNvme,
      supportsSed: device.supportsSed,
      mounted: device.mounted,
      isSystemDisk: device.isSystemDisk,
      capabilitySnapshot: device.capabilitySnapshot as Prisma.InputJsonObject,
      lastSeenAt: new Date(),
    };
    if (existing) await prisma.device.update({ where: { id: existing.id }, data });
    else await prisma.device.create({ data });
  }
  cache = { expiresAt: Date.now() + CACHE_MS, devices };
  return devices;
}

export function clearDeviceDiscoveryCache(): void {
  cache = null;
}
