import { jobEventSchema, type JobEvent } from "@repo/shared";
import { createRedisConnection } from "./redis.js";

export type EventPublisher = {
  publish: (event: JobEvent) => Promise<void>;
};

export function createLocalPublisher(
  emit: (event: JobEvent) => void,
): EventPublisher {
  return {
    publish: async (event) => {
      const parsed = jobEventSchema.parse(event);
      emit(parsed);
    },
  };
}

export function createRedisPublisher(redisUrl: string): EventPublisher {
  const publisher = createRedisConnection(redisUrl);
  return {
    publish: async (event) => {
      const parsed = jobEventSchema.parse(event);
      await publisher.publish("forensweep:job-events", JSON.stringify(parsed));
    },
  };
}
