import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { logInfo } from "../lib/logger.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const booleanFromString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return value;
}, z.boolean());

const rawEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().min(1).default("8h"),
  INTERNAL_WORKER_TOKEN: z.string().min(1),
  REDIS_URL: z.string().url(),
  SAFE_IMAGE_ROOT: z.string().min(1),
  SAFE_OUTPUT_ROOT: z.string().min(1),
  REAL_DEVICE_OPERATIONS: booleanFromString.default(false),
  CORS_ORIGIN: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  WS_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  CERT_PUBLIC_KEY_PATH: z
    .string()
    .min(1)
    .default("./secrets/forensweep-ed25519-public.pem"),
  HARDWARE_DEMO_ENABLED: booleanFromString.default(false),
  HARDWARE_DEMO_ALLOWED_METHOD: z
    .literal("OVERWRITE_SINGLE")
    .default("OVERWRITE_SINGLE"),
  HARDWARE_DEMO_MAX_CAPACITY_BYTES: z.coerce.bigint().positive().optional(),
  HARDWARE_DEMO_CONFIRM_PHRASE: z.string().min(1).optional(),
  PROTECTED_DEVICES_PATH: z.string().min(1).default("./protected-devices.json"),
});

const parsed = rawEnvSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map(
    (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
  );
  throw new Error(
    `Invalid backend environment configuration:\n${issues.join("\n")}`,
  );
}

if (parsed.data.NODE_ENV !== "test") {
  if (parsed.data.JWT_SECRET.length < 32)
    throw new Error("JWT_SECRET must be at least 32 characters");
  if (parsed.data.INTERNAL_WORKER_TOKEN.length < 32)
    throw new Error("INTERNAL_WORKER_TOKEN must be at least 32 characters");
}

export type AppEnv = z.infer<typeof rawEnvSchema>;
export const env: Readonly<AppEnv> = Object.freeze(parsed.data);

export const hardwareDemoGate =
  env.REAL_DEVICE_OPERATIONS &&
  env.HARDWARE_DEMO_ENABLED &&
  env.HARDWARE_DEMO_ALLOWED_METHOD === "OVERWRITE_SINGLE" &&
  env.HARDWARE_DEMO_MAX_CAPACITY_BYTES !== undefined &&
  env.HARDWARE_DEMO_CONFIRM_PHRASE !== undefined
    ? Object.freeze({
        maxCapacityBytes: env.HARDWARE_DEMO_MAX_CAPACITY_BYTES,
        confirmPhrase: env.HARDWARE_DEMO_CONFIRM_PHRASE,
      })
    : null;

if (env.REAL_DEVICE_OPERATIONS) {
  logInfo(
    "WARNING: REAL_DEVICE_OPERATIONS=true. This phase does not implement physical-drive actions.",
  );
}
