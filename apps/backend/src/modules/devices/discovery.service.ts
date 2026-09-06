import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { deviceProfileSchema } from "@repo/shared";
import { prisma } from "../../lib/prisma.js";
import { safeReadCommand } from "../../lib/safe-exec.js";
import { AppError } from "../../middleware/error-handler.js";
import type { DeviceRecord } from "./device.service.js";

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

type Discovery = {
  path: string;
  type: DeviceRecord["type"];
  model: string | null;
  serial: string | null;
  sizeBytes: bigint | null;
  supportsAta: boolean;
  supportsNvme: boolean;
  supportsSed: boolean;
  mounted: boolean;
  isSystemDisk: boolean;
  capabilitySnapshot: Record<string, unknown>;
};

let cache: { expiresAt: number; devices: Discovery[] } | null = null;
const CACHE_MS = 4000;

function walk(node: LsblkNode): LsblkNode[] {
  return [node, ...(node.children ?? []).flatMap(walk)];
}

function mounts(node: LsblkNode): string[] {
  return [
    ...(node.mountpoints ?? []).filter((mount): mount is string => Boolean(mount)),
    ...(node.mountpoint ? [node.mountpoint] : []),
    ...(node.children ?? []).flatMap(mounts),
  ];
}

function pathFor(node: LsblkNode): string | null {
  const path = node.path ?? (node.name ? `/dev/${node.name}` : null);
  return path && /^\/dev\/[A-Za-z0-9._-]+$/.test(path) ? path : null;
}

function mediaType(node: LsblkNode): DeviceRecord["type"] {
  const model = String(node.model ?? "").toUpperCase();
  const transport = String(node.tran ?? "").toLowerCase();
  if (node.rota === 1 || node.rota === true) return "HDD";
  if (node.rota === 0 || node.rota === false || transport === "nvme" || /SSD|NVME/.test(model)) return "SSD";
  if (transport === "usb") return "USB";
  if (transport === "mmc") return "SD_CARD";
  return "UNKNOWN";
}

function sizeOf(value: LsblkNode["size"]): bigint | null {
  if (value === null || value === undefined) return null;
  try { return BigInt(String(value)); } catch { return null; }
}

async function probe(command: string, args: string[]): Promise<Record<string, unknown>> {
  try {
    const result = await safeReadCommand(command, args);
    if (result.code !== 0) return {};
    return JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function rootSource(): Promise<string | null> {
  try {
    const result = await safeReadCommand("findmnt", ["/", "-no", "SOURCE"]);
    return result.code === 0 ? result.stdout.trim() : null;
  } catch { return null; }
}

function isSystemDisk(node: LsblkNode, root: string | null): boolean {
  const paths = walk(node).map(pathFor).filter((path): path is string => path !== null);
  const mountpoints = walk(node).flatMap((item) => [item.mountpoint, ...(item.mountpoints ?? [])]);
  return mountpoints.some((mount) => mount === "/" || mount === "/boot") || Boolean(root && paths.includes(root));
}

export async function discoverLinuxDevices(): Promise<Discovery[]> {
  if (process.platform !== "linux")
    throw new AppError(503, "DEVICE_DISCOVERY_UNAVAILABLE", "Linux device discovery is unavailable on this host");
  let result;
  try {
    result = await safeReadCommand("lsblk", ["-J", "-O"], 5000);
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
  const nodes = parsed.blockdevices ?? [];
  const root = await rootSource();
  const devices: Discovery[] = [];
  for (const node of nodes) {
    if (node.type !== "disk") continue;
    const path = pathFor(node);
    if (!path) continue;
    const transport = String(node.tran ?? "").toLowerCase();
    const smart = await probe("smartctl", ["-i", path]);
    const nvme = transport === "nvme" ? await probe("nvme", ["id-ctrl", path]) : {};
    const smartText = JSON.stringify(smart).toUpperCase();
    const device = {
      path,
      type: mediaType(node),
      model: node.model ? String(node.model).trim() : null,
      serial: node.serial ? String(node.serial).trim() : null,
      sizeBytes: sizeOf(node.size),
      supportsAta: transport === "ata" || transport === "sata" || smartText.includes("ATA_VERSION"),
      supportsNvme: transport === "nvme" && Object.keys(nvme).length > 0,
      supportsSed: smartText.includes("OPAL") || smartText.includes('"SED":TRUE'),
      mounted: mounts(node).length > 0,
      isSystemDisk: isSystemDisk(node, root),
      capabilitySnapshot: {
        transport: transport || "unknown",
        removable: node.rm === true || node.rm === 1,
        readOnly: node.ro === true || node.ro === 1,
        rotational: node.rota === true || node.rota === 1 ? true : node.rota === false || node.rota === 0 ? false : null,
        smartctl: smart,
        nvme,
        rootSource: root,
      },
    } satisfies Discovery;
    const profile = deviceProfileSchema.safeParse({
      id: randomUUID(), type: device.type, interface: device.supportsNvme ? "NVME" : device.supportsAta ? "SATA" : transport === "usb" ? "USB" : "UNKNOWN",
      model: device.model, serial: device.serial, sizeBytes: device.sizeBytes?.toString() ?? null,
      supportsAta: device.supportsAta, supportsNvme: device.supportsNvme, supportsSed: device.supportsSed,
      lastSeenAt: new Date().toISOString(),
    });
    if (!profile.success) throw new Error(`Malformed device profile for ${path}`);
    devices.push(device);
  }
  return devices;
}

export async function scanAndPersistDevices(force = false): Promise<Discovery[]> {
  if (!force && cache && cache.expiresAt > Date.now()) return cache.devices;
  const devices = await discoverLinuxDevices();
  const seen = new Set<string>();
  for (const device of devices) {
    seen.add(device.path);
    const existing = await prisma.device.findFirst({ where: { path: device.path }, select: { id: true } });
    const data = {
      path: device.path, type: device.type, model: device.model, serial: device.serial,
      sizeBytes: device.sizeBytes, supportsAta: device.supportsAta, supportsNvme: device.supportsNvme,
      supportsSed: device.supportsSed, mounted: device.mounted, isSystemDisk: device.isSystemDisk,
      capabilitySnapshot: device.capabilitySnapshot as Prisma.InputJsonObject, lastSeenAt: new Date(),
    };
    if (existing) await prisma.device.update({ where: { id: existing.id }, data });
    else await prisma.device.create({ data });
  }
  cache = { expiresAt: Date.now() + CACHE_MS, devices };
  return devices;
}

export function clearDeviceDiscoveryCache(): void { cache = null; }