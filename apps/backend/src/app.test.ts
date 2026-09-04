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
const baseDevice = {
  id: "00000000-0000-4000-8000-000000000101",
  path: "SAFE_IMAGE_ROOT/demo.img",
  type: "HDD" as const,
  model: "Mock Device",
  serial: "MOCK-001",
  sizeBytes: 1000n,
  supportsAta: false,
  supportsNvme: false,
  supportsSed: false,
  mounted: false,
  isSystemDisk: false,
  capabilitySnapshot: { simulated: true },
  lastSeenAt: new Date("2026-09-04T00:00:00.000Z"),
};
const devices = [baseDevice];
const audits: Array<Record<string, unknown>> = [];
const jobs: Array<Record<string, unknown>> = [];
const deviceStore = {
  device: {
    findMany: async () => devices,
    findUnique: async ({ where }: { where: { id: string } }) =>
      devices.find((device) => device.id === where.id) ?? null,
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { lastSeenAt: Date };
    }) => {
      const device = devices.find((entry) => entry.id === where.id);
      if (!device) throw new Error("Device not found");
      Object.assign(device, data);
      return device;
    },
  },
  auditLog: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      audits.push(data);
      return data;
    },
    findFirst: async () => audits.at(-1) ?? null,
    findMany: async ({ where }: { where: { jobId: string } }) =>
      audits.filter((audit) => audit.jobId === where.jobId),
  },
} as never;
const deviceApp = createApp({ userStore: fakeStore, deviceStore });
const jobStore = {
  device: deviceStore.device,
  auditLog: deviceStore.auditLog,
  job: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const id = `00000000-0000-4000-8000-${String(jobs.length + 1).padStart(12, "0")}`;
      const job = { id, createdAt: new Date(), ...data };
      jobs.push(job);
      return job;
    },
    findUnique: async ({ where }: { where: { id: string } }) =>
      jobs.find((job) => job.id === where.id) ?? null,
    findMany: async ({ where }: { where?: { userId: string } }) =>
      where ? jobs.filter((job) => job.userId === where.userId) : jobs,
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      const job = jobs.find((entry) => entry.id === where.id);
      if (!job) throw new Error("Job not found");
      Object.assign(job, data);
      return job;
    },
  },
} as never;
const queuedJobs: Array<{ name: string; data: Record<string, unknown> }> = [];
const testQueue = {
  addErase: async (jobId: string) => {
    queuedJobs.push({ name: "erase", data: { jobId } });
  },
  addRecover: async (jobId: string) => {
    queuedJobs.push({ name: "recover", data: { jobId } });
  },
};
const jobApp = createApp({ userStore: fakeStore, deviceStore, jobStore });
const jobAppWithQueue = createApp({
  userStore: fakeStore,
  deviceStore,
  jobStore,
  jobQueue: testQueue,
});

async function request(
  targetApp: ReturnType<typeof createApp>,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const server = targetApp.listen(0);
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
  const response = await request(app, "/health");
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
  const response = await request(app, "/api/auth/login", {
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
  const me = await request(app, "/api/auth/me");
  const ping = await request(app, "/api/admin/ping");
  assert.equal(me.status, 401);
  assert.equal(ping.status, 401);
});

test("unknown routes use the error envelope", async () => {
  const response = await request(app, "/missing");
  const body = (await response.json()) as {
    success: boolean;
    error: { code: string };
  };
  assert.equal(response.status, 404);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "NOT_FOUND");
});

test("valid login returns a token and public user", async () => {
  const response = await request(app, "/api/auth/login", {
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
  const response = await request(app, "/api/auth/me", {
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
  const forbidden = await request(app, "/api/admin/ping", {
    headers: { authorization: `Bearer ${operatorToken}` },
  });
  const allowed = await request(app, "/api/admin/ping", {
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(forbidden.status, 403);
  assert.equal(allowed.status, 200);
});

test("invalid credentials return a generic unauthorized response", async () => {
  const response = await request(app, "/api/auth/login", {
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
  const response = await request(app, "/api/auth/me", {
    headers: { authorization: "Bearer invalid-token" },
  });
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "AUTH_TOKEN_INVALID");
});

async function preview(deviceId: string, options: Record<string, unknown>) {
  const token = createToken({
    sub: fakeUser.id,
    username: fakeUser.username,
    role: fakeUser.role,
  });
  const response = await request(deviceApp, "/api/jobs/erase/preview", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ deviceId, eraseScope: "WHOLE_DRIVE", ...options }),
  });
  return {
    response,
    body: (await response.json()) as { data: Record<string, unknown> },
  };
}

test("device endpoints return BigInt-safe profiles and refresh audit events", async () => {
  const token = createToken({
    sub: fakeUser.id,
    username: fakeUser.username,
    role: fakeUser.role,
  });
  const profileResponse = await request(
    deviceApp,
    `/api/devices/${baseDevice.id}/profile`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const profileBody = (await profileResponse.json()) as {
    data: { sizeBytes: string; path: string };
  };
  assert.equal(profileResponse.status, 200);
  assert.equal(profileBody.data.sizeBytes, "1000");
  assert.equal(profileBody.data.path, baseDevice.path);
  const refreshResponse = await request(deviceApp, "/api/devices/refresh", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(refreshResponse.status, 200);
  assert.equal(audits.at(-1)?.action, "DEVICE_SCAN");
});

test("HDD whole-drive preview recommends multi-pass overwrite", async () => {
  const result = await preview(baseDevice.id, {});
  assert.equal(result.body.data.recommendedMethod, "OVERWRITE_MULTI");
});

test("SATA SSD preview recommends ATA secure erase", async () => {
  const device = {
    ...baseDevice,
    id: "00000000-0000-4000-8000-000000000102",
    type: "SSD" as const,
    supportsAta: true,
  };
  devices.push(device);
  const result = await preview(device.id, {});
  assert.equal(result.body.data.recommendedMethod, "ATA_SECURE_ERASE");
});

test("NVMe overwrite request is rejected as unsafe", async () => {
  const device = {
    ...baseDevice,
    id: "00000000-0000-4000-8000-000000000103",
    type: "SSD" as const,
    supportsNvme: true,
  };
  devices.push(device);
  const result = await preview(device.id, {
    requestedMethod: "OVERWRITE_SINGLE",
  });
  assert.equal(result.body.data.requestedMethodRejected, true);
  assert.equal(result.body.data.simulationAvailable, false);
});

test("SED preview recommends cryptographic erase", async () => {
  const device = {
    ...baseDevice,
    id: "00000000-0000-4000-8000-000000000104",
    type: "SSD" as const,
    supportsSed: true,
  };
  devices.push(device);
  const result = await preview(device.id, {});
  assert.equal(result.body.data.recommendedMethod, "CRYPTO_ERASE");
});

test("USB preview exposes limited assurance warnings", async () => {
  const device = {
    ...baseDevice,
    id: "00000000-0000-4000-8000-000000000105",
    type: "USB" as const,
  };
  devices.push(device);
  const result = await preview(device.id, {});
  assert.equal(result.body.data.riskLevel, "HIGH");
  assert.equal(
    (result.body.data.warnings as string[]).some((warning) =>
      warning.includes("limited assurance"),
    ),
    true,
  );
});

test("specific-file scope uses logical file overwrite and warns for SSD cells", async () => {
  const device = {
    ...baseDevice,
    id: "00000000-0000-4000-8000-000000000106",
    type: "SSD" as const,
    supportsAta: true,
  };
  devices.push(device);
  const token = createToken({
    sub: fakeUser.id,
    username: fakeUser.username,
    role: fakeUser.role,
  });
  const response = await request(deviceApp, "/api/jobs/erase/preview", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ deviceId: device.id, eraseScope: "SPECIFIC_FILES" }),
  });
  const body = (await response.json()) as {
    data: { recommendedMethod: string; warnings: string[] };
  };
  assert.equal(body.data.recommendedMethod, "FILE_LEVEL_OVERWRITE");
  assert.equal(
    body.data.warnings.some((warning) => warning.includes("physical-cell")),
    true,
  );
});

test("mounted and system disks cannot proceed", async () => {
  const mounted = {
    ...baseDevice,
    id: "00000000-0000-4000-8000-000000000107",
    mounted: true,
  };
  const system = {
    ...baseDevice,
    id: "00000000-0000-4000-8000-000000000108",
    isSystemDisk: true,
  };
  devices.push(mounted, system);
  const mountedResult = await preview(mounted.id, {});
  const systemResult = await preview(system.id, {});
  assert.equal(mountedResult.body.data.simulationAvailable, false);
  assert.equal(systemResult.body.data.simulationAvailable, false);
  assert.equal(mountedResult.body.data.canProceed, false);
  assert.equal(systemResult.body.data.canProceed, false);
  assert.equal(mountedResult.body.data.rejectionReason, "DEVICE_MOUNTED");
  assert.equal(systemResult.body.data.rejectionReason, "SYSTEM_DISK_PROTECTED");
  assert.equal(mountedResult.body.data.typeToConfirm, null);
  assert.equal(systemResult.body.data.typeToConfirm, null);
});

function authHeader(role: "ADMIN" | "OPERATOR" | "INVESTIGATOR") {
  return {
    authorization: `Bearer ${createToken({ sub: fakeUser.id, username: role.toLowerCase(), role })}`,
    "content-type": "application/json",
  };
}

test("erase creation rejects an invalid confirmation", async () => {
  const response = await request(jobApp, "/api/jobs/erase", {
    method: "POST",
    headers: authHeader("OPERATOR"),
    body: JSON.stringify({
      deviceId: baseDevice.id,
      eraseScope: "WHOLE_DRIVE",
      typeToConfirm: "WRONG",
    }),
  });
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_CONFIRMATION");
});

test("only admins can approve and approved jobs retain approver data", async () => {
  const createResponse = await request(jobApp, "/api/jobs/erase", {
    method: "POST",
    headers: authHeader("OPERATOR"),
    body: JSON.stringify({
      deviceId: baseDevice.id,
      eraseScope: "WHOLE_DRIVE",
      typeToConfirm: baseDevice.serial,
    }),
  });
  const created = (await createResponse.json()) as { data: { id: string } };
  const denied = await request(jobApp, `/api/jobs/${created.data.id}/approve`, {
    method: "POST",
    headers: authHeader("OPERATOR"),
  });
  assert.equal(denied.status, 403);
  const approved = await request(
    jobApp,
    `/api/jobs/${created.data.id}/approve`,
    { method: "POST", headers: authHeader("ADMIN") },
  );
  const approvedBody = (await approved.json()) as {
    data: { approvalStatus: string; approvedById: string; approvedAt: string };
  };
  assert.equal(approved.status, 200);
  assert.equal(approvedBody.data.approvalStatus, "APPROVED");
  assert.equal(approvedBody.data.approvedById, fakeUser.id);
  assert.ok(approvedBody.data.approvedAt);
});

test("investigators can create recovery jobs but not erase jobs", async () => {
  const recovery = await request(jobApp, "/api/jobs/recover", {
    method: "POST",
    headers: authHeader("INVESTIGATOR"),
    body: JSON.stringify({ imageId: "00000000-0000-4000-8000-000000000999" }),
  });
  assert.equal(recovery.status, 201);
  const erase = await request(jobApp, "/api/jobs/erase", {
    method: "POST",
    headers: authHeader("INVESTIGATOR"),
    body: JSON.stringify({
      deviceId: baseDevice.id,
      eraseScope: "WHOLE_DRIVE",
      typeToConfirm: baseDevice.serial,
    }),
  });
  assert.equal(erase.status, 403);
});

test("job audit events contain hash-chain fields", async () => {
  const job = jobs[0];
  assert.ok(job?.id);
  const response = await request(jobApp, `/api/jobs/${job.id}/audit`, {
    headers: authHeader("ADMIN"),
  });
  const body = (await response.json()) as {
    data: Array<{ eventHash: string; previousHash?: string }>;
  };
  assert.equal(response.status, 200);
  assert.ok(body.data.length > 0);
  assert.ok(body.data[0]?.eventHash);
  assert.ok(
    audits.some(
      (audit) => audit.action === "ERASE_REQUESTED" && audit.eventHash,
    ),
  );
  assert.ok(
    audits.some(
      (audit) => audit.action === "ERASE_APPROVED" && audit.previousHash,
    ),
  );
});

test("approved erase and recovery creation enqueue internal job IDs", async () => {
  const eraseResponse = await request(jobAppWithQueue, "/api/jobs/erase", {
    method: "POST",
    headers: authHeader("OPERATOR"),
    body: JSON.stringify({
      deviceId: baseDevice.id,
      eraseScope: "WHOLE_DRIVE",
      typeToConfirm: baseDevice.serial,
    }),
  });
  const eraseBody = (await eraseResponse.json()) as { data: { id: string } };
  assert.equal(
    queuedJobs.some((entry) => entry.name === "erase"),
    false,
  );
  await request(jobAppWithQueue, `/api/jobs/${eraseBody.data.id}/approve`, {
    method: "POST",
    headers: authHeader("ADMIN"),
  });
  const recoveryResponse = await request(jobAppWithQueue, "/api/jobs/recover", {
    method: "POST",
    headers: authHeader("INVESTIGATOR"),
    body: JSON.stringify({ imageId: "00000000-0000-4000-8000-000000000999" }),
  });
  assert.equal(recoveryResponse.status, 201);
  assert.ok(
    queuedJobs.every(
      (entry) =>
        Object.keys(entry.data).length === 1 &&
        typeof entry.data.jobId === "string",
    ),
  );
  assert.ok(queuedJobs.some((entry) => entry.name === "erase"));
  assert.ok(queuedJobs.some((entry) => entry.name === "recover"));
});
