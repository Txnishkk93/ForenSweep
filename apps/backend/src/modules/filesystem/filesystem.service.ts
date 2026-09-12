import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { accessSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { AppError } from "../../middleware/error-handler.js";

export type FsEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  sizeBytes: string | null;
  modifiedAt: string | null;
  isSystemProtected?: boolean;
};

export type FsBrowseResponse = {
  currentPath: string | null;
  parentPath: string | null;
  entries: FsEntry[];
};

function systemRoots(): string[] {
  if (process.platform === "win32") {
    const roots: string[] = [];
    for (let code = 65; code <= 90; code += 1) {
      const root = `${String.fromCharCode(code)}:\\`;
      try {
        accessSync(root);
        roots.push(root);
      } catch {
        // Drive is not mounted.
      }
    }
    return roots.length ? roots : [process.env.SystemDrive ? `${process.env.SystemDrive}\\` : "C:\\"];
  }
  if (process.platform === "darwin") {
    try {
      return readdirSync("/Volumes", { withFileTypes: true })
        .filter((entry: { isDirectory: () => boolean }) => entry.isDirectory())
        .map((entry: { name: string }) => join("/Volumes", entry.name));
    } catch {
      return ["/"];
    }
  }
  return ["/"];
}

function protectedPath(path: string): boolean {
  const normalized = process.platform === "win32" ? path.replaceAll("/", "\\").toLowerCase() : path;
  if (process.platform === "win32") {
    const systemDrive = (process.env.SystemDrive ?? "C:").replaceAll("/", "\\").toLowerCase();
    return normalized === systemDrive || normalized.startsWith(`${systemDrive}\\windows`) || normalized.startsWith(`${systemDrive}\\program files`) || normalized.startsWith(`${systemDrive}\\programdata`) || normalized.startsWith(`${systemDrive}\\users\\public`);
  }
  return normalized === "/" || normalized === "/system" || normalized.startsWith("/system/") || normalized === "/usr" || normalized.startsWith("/usr/") || normalized === "/etc" || normalized.startsWith("/etc/") || normalized === "/bin" || normalized.startsWith("/bin/") || normalized === "/sbin" || normalized.startsWith("/sbin/") || normalized === "/var" || normalized.startsWith("/var/");
}

export function assertSafeLocalPath(rawPath: string): string {
  if (!isAbsolute(rawPath)) throw new AppError(400, "INVALID_LOCAL_PATH", "Local filesystem paths must be absolute");
  const candidate = resolve(rawPath);
  if (candidate === parse(candidate).root || protectedPath(candidate)) throw new AppError(400, "SYSTEM_PATH_PROTECTED", "System-critical paths cannot be erased");
  return candidate;
}

async function resolveLocalPath(rawPath: string, allowProtected = false): Promise<string> {
  if (!isAbsolute(rawPath)) throw new AppError(400, "INVALID_LOCAL_PATH", "Local filesystem paths must be absolute");
  const candidate = resolve(rawPath);
  if (!allowProtected && (candidate === parse(candidate).root || protectedPath(candidate))) throw new AppError(400, "SYSTEM_PATH_PROTECTED", "System-critical paths cannot be erased");
  try {
    const resolved = await realpath(candidate);
    if (!allowProtected && protectedPath(resolved)) throw new AppError(400, "SYSTEM_PATH_PROTECTED", "System-critical paths cannot be erased");
    return resolved;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "INVALID_LOCAL_PATH", "Path does not exist or is not reachable");
  }
}

export async function browseLocalFs(requestedPath?: string): Promise<FsBrowseResponse> {
  if (!requestedPath) {
    const entries: FsEntry[] = [];
    for (const root of systemRoots()) {
      try {
        const info = await stat(root);
        entries.push({ name: root, path: root, type: "directory", sizeBytes: null, modifiedAt: info.mtime.toISOString(), isSystemProtected: protectedPath(root) });
      } catch {
        // Root disappeared between discovery and listing.
      }
    }
    return { currentPath: null, parentPath: null, entries };
  }
  const currentPath = await resolveLocalPath(requestedPath, true);
  let info;
  try {
    info = await stat(currentPath);
    if (!info.isDirectory()) throw new Error("not a directory");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "INVALID_LOCAL_PATH", "Path is not a directory");
  }
  const entries = await readdir(currentPath, { withFileTypes: true });
  const visible = await Promise.all(entries.map(async (entry): Promise<FsEntry | null> => {
    const entryPath = join(currentPath, entry.name);
    try {
      const entryInfo = await lstat(entryPath);
      const resolvedEntry = await realpath(entryPath);
      return {
        name: entry.name,
        path: resolvedEntry,
        type: entryInfo.isDirectory() ? "directory" : "file",
        sizeBytes: entryInfo.isDirectory() ? null : entryInfo.size.toString(),
        modifiedAt: entryInfo.mtime.toISOString(),
        isSystemProtected: protectedPath(resolvedEntry),
      };
    } catch {
      return null;
    }
  }));
  const safeEntries = visible.filter((entry): entry is FsEntry => entry !== null);
  safeEntries.sort((left, right) => Number(right.type === "directory") - Number(left.type === "directory") || left.name.localeCompare(right.name));
  const parent = dirname(currentPath);
  return { currentPath, parentPath: parent === currentPath ? null : parent, entries: safeEntries.slice(0, 200) };
}

export async function validateErasePaths(paths: string[]): Promise<string[]> {
  const resolvedPaths: string[] = [];
  for (const rawPath of paths) {
    try {
      if ((await lstat(rawPath)).isSymbolicLink()) throw new AppError(400, "INVALID_LOCAL_PATH", "Symlink targets cannot be erased");
    } catch (error) {
      if (error instanceof AppError) throw error;
    }
    const resolved = await resolveLocalPath(rawPath);
    const info = await lstat(resolved);
    if (!info.isFile() && !info.isDirectory()) throw new AppError(400, "INVALID_LOCAL_PATH", "Only files and directories can be erased");
    resolvedPaths.push(resolved);
  }
  return [...new Set(resolvedPaths)];
}
