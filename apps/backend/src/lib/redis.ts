import { Redis, type RedisOptions } from "ioredis";
import { logError } from "./logger.js";

export function createRedisConnection(
  url: string,
  options: RedisOptions = {},
): Redis {
  const redis = new Redis(url, {
    retryStrategy: (times) => Math.min(times * 200, 5000),
    maxRetriesPerRequest: 3,
    ...options,
  });
  redis.on("error", (error) => {
    logError("Redis connection error", { error: error.message });
  });
  return redis;
}
