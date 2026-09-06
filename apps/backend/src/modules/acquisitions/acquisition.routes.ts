import { Router, type Router as RouterType } from "express";
import multer from "multer";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { sendSuccess } from "../../lib/serialize.js";
import { listAvailableImages, safeImageRoot } from "./acquisition.service.js";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";
import { appendAuditEvent } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";

export const acquisitionRoutes: RouterType = Router();
acquisitionRoutes.use(requireAuth);
acquisitionRoutes.get(
  "/available-images",
  asyncHandler(async (req, res) =>
    sendSuccess(res, await listAvailableImages(), 200, { requestId: req.requestId }),
  ),
);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, safeImageRoot()),
    filename: (_req, file, callback) => callback(null, generatedUploadFilename(file.originalname)),
  }),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 },
});

export function generatedUploadFilename(originalName: string): string {
  return `${randomUUID()}.upload${path.extname(originalName).toLowerCase()}`;
}

export function hasZipSignature(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08));
}

export function isRawBinary(bytes: Buffer): boolean {
  if (bytes.length === 0 || hasZipSignature(bytes)) return false;
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  let printable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) printable += 1;
  }
  return printable / sample.length < 0.98 || sample.every((byte) => byte === 0);
}

async function runZipExtraction(source: string, output: string, extractionRoot: string): Promise<void> {
  const child = spawn("python", ["-m", "forensweep_worker.upload_zip", source, output, extractionRoot], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..", "forensic-worker"),
    env: { ...process.env, MAX_UPLOAD_BYTES: String(env.MAX_UPLOAD_BYTES) },
    shell: false,
  });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  if (code !== 0) throw new AppError(400, "INVALID_ZIP", stderr.trim() || "Upload is not a safe, valid ZIP archive");
}

acquisitionRoutes.post(
  "/upload",
  requireRole("OPERATOR", "INVESTIGATOR", "ADMIN"),
  upload.single("image"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new AppError(400, "UPLOAD_FILE_REQUIRED", "Upload a single .img or .zip file");
    const extension = path.extname(file.originalname).toLowerCase();
    const root = safeImageRoot();
    const uploadedPath = path.resolve(file.path);
    let finalPath = uploadedPath;
    let extractionRoot: string | undefined;
    try {
      const bytes = await readFile(uploadedPath);
      if (extension === ".img") {
        if (!isRawBinary(bytes)) throw new AppError(400, "INVALID_IMAGE_SIGNATURE", "The .img upload does not contain raw binary image data");
        finalPath = path.join(root, `${randomUUID()}.img`);
        await writeFile(finalPath, bytes, { flag: "wx" });
      } else if (extension === ".zip") {
        if (!hasZipSignature(bytes)) throw new AppError(400, "INVALID_ZIP_SIGNATURE", "The .zip upload is not a valid ZIP archive");
        finalPath = path.join(root, `${randomUUID()}.img`);
        extractionRoot = path.join(root, randomUUID());
        await runZipExtraction(uploadedPath, finalPath, extractionRoot);
      } else {
        throw new AppError(400, "UPLOAD_TYPE_NOT_ALLOWED", "Only .img and .zip uploads are supported");
      }
      const metadata = await stat(finalPath);
      const contentHash = createHash("sha256").update(await readFile(finalPath)).digest("hex");
      const image = (await listAvailableImages()).find((candidate) => candidate.filename === path.relative(root, finalPath).replaceAll(path.sep, "/"));
      if (!image) throw new AppError(500, "UPLOAD_NOT_DISCOVERABLE", "Uploaded image could not be registered");
      await appendAuditEvent(prisma, {
        userId: req.auth!.userId,
        action: "ACQUISITION_UPLOADED",
        detail: {
          originalFilename: file.originalname,
          fileSize: file.size,
          sourcePath: finalPath,
          imagePath: finalPath,
          contentHash,
          hashVerified: true,
          uploadType: extension.slice(1),
        },
      });
      return sendSuccess(res, { acquisitionId: image.id, filename: image.filename, sizeBytes: metadata.size.toString() }, 200, { requestId: req.requestId });
    } catch (error) {
      await rm(finalPath, { force: true }).catch(() => undefined);
      throw error;
    } finally {
      if (uploadedPath !== finalPath) await rm(uploadedPath, { force: true }).catch(() => undefined);
      if (extractionRoot) await rm(extractionRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }),
);