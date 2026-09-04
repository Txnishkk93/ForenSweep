# ForenSweep WebSocket Service

Phase 4 provides JWT-authenticated Socket.IO job rooms. Clients connect with `auth.token`, then emit `job:subscribe` with a job ID. The service checks ownership or `ADMIN` role before joining `job:{jobId}`. Job events arrive through Redis and are emitted only to the matching room.

```bash
bun run --cwd apps/ws dev
```

Supported events are `job:progress`, `job:status`, `job:warning`, `job:completed`, and `job:failed`.
