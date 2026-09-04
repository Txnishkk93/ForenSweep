import { strict as assert } from "node:assert";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "test-secret";
process.env.INTERNAL_WORKER_TOKEN = "test-worker-token";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.SAFE_IMAGE_ROOT = "../../storage/safe-images";
process.env.SAFE_OUTPUT_ROOT = "../../storage/output";

const { createApp } = await import("./app.js");
const { createToken } = await import("./lib/jwt.js");
const { default: bcrypt } = await import("bcryptjs");
const fakeUser = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "admin",
  email: "admin@example.test",
  passwordHash: await bcrypt.hash("password123", 4),
  role: "ADMIN" as const,
  createdAt: new Date("2026-09-04T00:00:00.000Z"),
};
const fakeStore = {
  user: { findFirst: async () => fakeUser, findUnique: async () => fakeUser },
} as never;
const app = createApp({ userStore: fakeStore });

async function request(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not start");
  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, options);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("GET /health returns a success envelope and request ID", async () => {
  const response = await request("/health");
  const body = (await response.json()) as {
    success: boolean;
    meta: { requestId: string };
  };
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(body.meta.requestId);
  assert.equal(response.headers.get("x-request-id"), body.meta.requestId);
});

test("login validation rejects malformed input", async () => {
  const response = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "a", password: "short" }),
  });
  const body = (await response.json()) as {
    success: boolean;
    error: { code: string };
  };
  assert.equal(response.status, 400);
  assert.equal(body.error.code, "VALIDATION_ERROR");
});

test("protected routes reject missing authentication", async () => {
  const me = await request("/api/auth/me");
  const ping = await request("/api/admin/ping");
  assert.equal(me.status, 401);
  assert.equal(ping.status, 401);
});

test("unknown routes use the error envelope", async () => {
  const response = await request("/missing");
  const body = (await response.json()) as {
    success: boolean;
    error: { code: string };
  };
  assert.equal(response.status, 404);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "NOT_FOUND");
});

test("valid login returns a token and public user", async () => {
  const response = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "password123" }),
  });
  const body = (await response.json()) as {
    success: boolean;
    data: { accessToken: string; user: Record<string, unknown> };
  };
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(body.data.accessToken);
  assert.equal("passwordHash" in body.data.user, false);
});

test("auth me returns the public user for a valid token", async () => {
  const token = createToken({
    sub: fakeUser.id,
    username: fakeUser.username,
    role: fakeUser.role,
  });
  const response = await request("/api/auth/me", {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = (await response.json()) as {
    success: boolean;
    data: Record<string, unknown>;
  };
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.username, fakeUser.username);
  assert.equal("passwordHash" in body.data, false);
});

test("admin ping enforces role", async () => {
  const operatorToken = createToken({
    sub: fakeUser.id,
    username: "operator",
    role: "OPERATOR",
  });
  const adminToken = createToken({
    sub: fakeUser.id,
    username: fakeUser.username,
    role: "ADMIN",
  });
  const forbidden = await request("/api/admin/ping", {
    headers: { authorization: `Bearer ${operatorToken}` },
  });
  const allowed = await request("/api/admin/ping", {
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(forbidden.status, 403);
  assert.equal(allowed.status, 200);
});

test("invalid credentials return a generic unauthorized response", async () => {
  const response = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "wrong-password" }),
  });
  const body = (await response.json()) as {
    error: { code: string; message: string };
  };
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "INVALID_CREDENTIALS");
  assert.equal(body.error.message, "Invalid username/email or password");
});

test("invalid bearer tokens are rejected", async () => {
  const response = await request("/api/auth/me", {
    headers: { authorization: "Bearer invalid-token" },
  });
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "AUTH_TOKEN_INVALID");
});
