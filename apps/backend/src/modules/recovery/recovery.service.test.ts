import { strict as assert } from "node:assert";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { exportRecoveredFile } from "./recovery.service.js";

const fileId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";

function storeFor(root: string) {
  const source = join(root, "recovered.jpg");
  return {
    recoveredFile: {
      findUnique: async () => ({
        id: fileId,
        jobId,
        storedPath: source,
        fileName: "recovered.jpg",
        mimeType: "image/jpeg",
      }),
    },
    job: { findUnique: async () => ({ id: jobId, userId: "owner" }) },
    auditLog: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => data,
    },
  } as never;
}

test("recovered-file export enforces ownership and uses a controlled directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "forensweep-export-"));
  await writeFile(join(root, "recovered.jpg"), "safe artifact");
  await assert.rejects(
    () =>
      exportRecoveredFile(fileId, "other-user", false, root, storeFor(root)),
    /permission/,
  );
  const result = await exportRecoveredFile(
    fileId,
    "owner",
    false,
    root,
    storeFor(root),
  );
  assert.equal(await readFile(result.exportPath, "utf8"), "safe artifact");
});
