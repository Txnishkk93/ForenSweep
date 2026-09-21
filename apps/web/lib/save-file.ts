type DirectoryHandle = {
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{
      write: (value: Blob | Uint8Array | string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

export async function saveBytesToDisk(filename: string, data: Blob): Promise<void> {
  const browser = window as unknown as {
    showSaveFilePicker?: (options: { suggestedName: string }) => Promise<{
      createWritable: () => Promise<{ write: (value: Blob) => Promise<void>; close: () => Promise<void> }>;
    }>;
  };

  if (browser.showSaveFilePicker) {
    try {
      const handle = await browser.showSaveFilePicker({ suggestedName: filename });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeExportName(filename: string, fallbackIndex: number): string {
  const base = filename.trim() || `recovered-file-${fallbackIndex + 1}`;
  return base.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ");
}

export async function saveFilesToDirectory(
  files: Array<{ filename: string; data: Blob }>,
  archiveName = "recovered-files.zip",
): Promise<{ written: number; failed: string[]; usedArchiveFallback: boolean }> {
  if (!files.length) {
    return { written: 0, failed: [], usedArchiveFallback: false };
  }

  const browser = window as unknown as {
    showDirectoryPicker?: () => Promise<DirectoryHandle>;
  };

  if (browser.showDirectoryPicker) {
    try {
      const directory = await browser.showDirectoryPicker();
      const writes = await Promise.allSettled(
        files.map(async ({ filename, data }, index) => {
          const fileHandle = await directory.getFileHandle(safeExportName(filename, index), { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(data);
          await writable.close();
        }),
      );

      const failed = writes
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason instanceof Error ? result.reason.message : "Unknown write error");

      return {
        written: writes.filter((result) => result.status === "fulfilled").length,
        failed,
        usedArchiveFallback: false,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { written: 0, failed: [], usedArchiveFallback: false };
      }
    }
  }

  const { zipSync } = await import("fflate");
  const payloadEntries = await Promise.all(
    files.map(async ({ filename, data }, index) => [
      safeExportName(filename, index),
      new Uint8Array(await data.arrayBuffer()),
    ]),
  );
  const zipped = zipSync(Object.fromEntries(payloadEntries));
  await saveBytesToDisk(archiveName, new Blob([zipped], { type: "application/zip" }));

  return {
    written: files.length,
    failed: [],
    usedArchiveFallback: true,
  };
}