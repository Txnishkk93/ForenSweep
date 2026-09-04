import { strict as assert } from "node:assert";
import { test } from "node:test";
import { simulateJob } from "./simulation.js";

const job = {
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  totalPasses: 3,
};

test("erase simulation persists the required stage sequence before events", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const audit: Array<Record<string, unknown>> = [];
  const store = {
    job: {
      findUnique: async () => job,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { ...job, ...data };
      },
    },
    auditLog: {
      findFirst: async () => audit.at(-1) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audit.push(data);
        return data;
      },
    },
  } as never;
  await simulateJob(job.id, "ERASE", store, {
    publish: async (event) => {
      assert.ok(updates.length > 0);
      events.push(event as { type: string; payload: Record<string, unknown> });
    },
  });
  assert.deepEqual(
    updates.map((update) => update.stage),
    ["RUNNING", "OVERWRITING", "VERIFYING", "CERTIFYING", "COMPLETED"],
  );
  assert.equal(updates.at(-1)?.status, "COMPLETED");
  assert.equal(audit[0]?.action, "JOB_STARTED");
  assert.equal(audit.at(-1)?.action, "JOB_COMPLETED");
  assert.ok(events.some((event) => event.type === "job:completed"));
});

test("recovery simulation persists carving and validation stages", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const audit: Array<Record<string, unknown>> = [];
  const store = {
    job: {
      findUnique: async () => ({ ...job, totalPasses: 0 }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { ...job, ...data };
      },
    },
    auditLog: {
      findFirst: async () => audit.at(-1) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audit.push(data);
        return data;
      },
    },
  } as never;
  await simulateJob(job.id, "RECOVER", store);
  assert.deepEqual(
    updates.map((update) => update.stage),
    ["RUNNING", "CARVING", "VALIDATING", "COMPLETED"],
  );
  assert.equal(updates.at(-1)?.status, "COMPLETED");
});
