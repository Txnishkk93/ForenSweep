import { strict as assert } from "node:assert";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "test-secret";
process.env.INTERNAL_WORKER_TOKEN = "test-worker-token";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.SAFE_IMAGE_ROOT = "../../storage/safe-images";
process.env.SAFE_OUTPUT_ROOT = "../../storage/output";
process.env.MAX_UPLOAD_BYTES = "1";

const { createApp } = await import("../../app.js");
const { createToken } = await import("../../lib/jwt.js");

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "operator",
  email: "operator@example.test",
  passwordHash: "unused",
  role: "OPERATOR" as const,
  createdAt: new Date(),
};
const app = createApp({
  userStore: { user: { findFirst: async () => user, findUnique: async () => user } } as never,
});

test("oversized uploads return 413 without reaching upload processing", async () => {
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array([0, 1])]), "test.img");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/acquisitions/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${createToken({ sub: user.id, username: user.username, role: user.role })}`,
      },
      body: form,
    });
    const body = (await response.json()) as { error?: { code?: string } };
    assert.equal(response.status, 413);
    assert.equal(body.error?.code, "UPLOAD_TOO_LARGE");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});