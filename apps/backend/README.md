# ForenSweep Backend Phase 3A

Phase 3A provides the Express foundation, validated environment configuration, JWT authentication, and admin role protection. It contains no device scanning, erasure, recovery, worker, queue, WebSocket, or physical-drive operations.

Copy `.env.example` to `.env` and set `DATABASE_URL`, `JWT_SECRET`, `INTERNAL_WORKER_TOKEN`, `REDIS_URL`, `SAFE_IMAGE_ROOT`, and `SAFE_OUTPUT_ROOT`. Use secrets of at least 32 characters for `JWT_SECRET` and `INTERNAL_WORKER_TOKEN` outside test mode.

```bash
bun install
bun run --cwd packages/db db:generate
bun run --cwd packages/db db:migrate
bun run --cwd packages/db db:seed
bun run --cwd apps/backend dev
bun run --cwd apps/backend worker
bun run --cwd apps/ws dev
bun run --cwd apps/backend test
```

Start local infrastructure with `docker compose up -d postgres redis`. The worker and WebSocket process require `REDIS_URL`; queue payloads contain only internal job IDs. All processing in this phase is simulation-only.

Run the simulation worker separately with `bun run --cwd apps/backend worker`, and run the WebSocket service with `bun run --cwd apps/ws dev`.

Example event:

```json
{
  "jobId": "00000000-0000-4000-8000-000000000001",
  "stage": "OVERWRITING",
  "progress": 40,
  "message": "Simulation stage: OVERWRITING"
}
```

Endpoints:

- `GET /health` public health check
- `POST /api/auth/login` public login with `{ "identifier": "...", "password": "..." }`
- `GET /api/auth/me` authenticated user profile
- `GET /api/admin/ping` authenticated `ADMIN` users only

````bash
curl http://localhost:4000/health
curl -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d "{\"identifier\":\"admin\",\"password\":\"<password>\"}"
curl http://localhost:4000/api/auth/me -H "Authorization: Bearer <token>"
curl http://localhost:4000/api/admin/ping -H "Authorization: Bearer <token>"
```# backend

To install dependencies:

```bash
bun install
````

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
