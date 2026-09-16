import { createHash } from "node:crypto";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";

export type AvailableImage = {
  id: string;
  filename: string;
  sizeBytes: string;
  createdAt: string;
  format: "FORENSWEEP_FORENSIC_ARCHIVE" | "RAW_IMAGE";
};

function imageRoot(): string {
  return path.resolve(env.SAFE_IMAGE_ROOT);
}

export function safeImageRoot(): string {
  return imageRoot();
}

function imageId(relativePath: string): string {
  const digest = createHash("sha256").update(relativePath).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

async function collect(root: string, directory = root): Promise<AvailableImage[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const images: AvailableImage[] = [];
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      images.push(...(await collect(root, candidate)));
      continue;
    }
    if (!entry.isFile() || ![".img", ".zip"].includes(path.extname(entry.name).toLowerCase())) continue;
    const resolved = await realpath(candidate);
    const relative = path.relative(root, resolved);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) continue;
    const metadata = await stat(resolved);
    if (metadata.size === 0) continue;
    if (entry.name.toLowerCase().endsWith(".forensic.zip")) {
      const signature = await readFile(resolved).then((bytes) => bytes.subarray(0, 2).toString("ascii")).catch(() => "");
      if (signature !== "PK") continue;
    }
    images.push({
      id: imageId(relative),
      filename: relative.replaceAll(path.sep, "/"),
      sizeBytes: metadata.size.toString(),
      createdAt: metadata.birthtime.toISOString(),
      format: relative.toLowerCase().endsWith(".forensic.zip")
        ? "FORENSWEEP_FORENSIC_ARCHIVE"
        : "RAW_IMAGE",
    });
  }
  return images;
}

export async function listAvailableImages(): Promise<AvailableImage[]> {
  const root = imageRoot();
  try {
    const metadata = await stat(root);
    if (!metadata.isDirectory()) throw new Error("image root is not a directory");
    return (await collect(root)).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } catch (error) {
    throw new AppError(503, "IMAGE_DISCOVERY_FAILED", "Unable to scan the safe image root", error instanceof Error ? { reason: error.message } : undefined);
  }
}

export async function resolveAvailableImage(id: string): Promise<string> {
  const images = await listAvailableImages();
  const image = images.find((candidate) => candidate.id === id);
  if (!image) throw new AppError(404, "IMAGE_NOT_FOUND", "Available image was not found");
  const resolved = path.resolve(imageRoot(), image.filename);
  if (!resolved.startsWith(`${imageRoot()}${path.sep}`))
    throw new AppError(400, "IMAGE_PATH_INVALID", "Image path is outside the safe image root");
  return resolved;
}