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