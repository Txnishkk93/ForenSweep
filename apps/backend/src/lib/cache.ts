import { createRedisConnection } from "./redis.js";

const redis = createRedisConnection(process.env.REDIS_URL ?? "redis://localhost:6379");

export async function getCachedOrFetch<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch {
    // Redis is an optimization; the database remains authoritative.
  }
  const fresh = await fetchFn();
  try {
    await redis.set(key, JSON.stringify(fresh), "EX", ttlSeconds);
  } catch {
    // A cache outage must not fail the read request.
  }
  return fresh;
}

export async function invalidateCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
    // A cache outage must not fail a mutation.
  }
}

export const cacheKeys = {
  devices: "forensweep:cache:devices",
  jobs: (userId: string, page: number, pageSize: number) =>
    `forensweep:cache:jobs:${userId}:${page}:${pageSize}`,
  jobSummary: (userId: string) => `forensweep:cache:job-summary:${userId}`,
  certificates: (userId: string, page: number, pageSize: number) =>
    `forensweep:cache:certificates:${userId}:${page}:${pageSize}`,
  audit: (userId: string, page: number, pageSize: number) =>
    `forensweep:cache:audit:${userId}:${page}:${pageSize}`,
};
