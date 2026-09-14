import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 10000);
const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ service: "forensweep-worker", status: "ok" }));
});

server.listen(port, () => {
  console.info(JSON.stringify({ message: "worker_health_started", port }));
});

await import("./index.js");

async function shutdown(): Promise<void> {
  server.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());