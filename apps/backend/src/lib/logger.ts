export function logInfo(
  message: string,
  fields: Record<string, unknown> = {},
): void {
  console.info(JSON.stringify({ level: "info", message, ...fields }));
}

export function logError(
  message: string,
  fields: Record<string, unknown> = {},
): void {
  console.error(JSON.stringify({ level: "error", message, ...fields }));
}
