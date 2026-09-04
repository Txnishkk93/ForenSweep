export function serialize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serialize(entry)]),
    );
  }
  return value;
}

export function sendSuccess<T>(
  res: import("express").Response,
  data: T,
  statusCode = 200,
  meta: Record<string, unknown> = {},
): void {
  res.status(statusCode).json({ success: true, data: serialize(data), meta });
}

export function sendCreated<T>(
  res: import("express").Response,
  data: T,
  meta: Record<string, unknown> = {},
): void {
  sendSuccess(res, data, 201, meta);
}
