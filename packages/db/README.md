# @repo/db

To install dependencies:

```bash
bun install
```

Set `DATABASE_URL` to a PostgreSQL database before running Prisma commands. The seed only creates simulated records and never scans local devices. Every seeded device has `isSystemDisk = false` and uses a `SAFE_IMAGE_ROOT/...` path.

The development seed uses these environment variables when present:

- `FORENSWEEP_ADMIN_PASSWORD`
- `FORENSWEEP_OPERATOR_PASSWORD`
- `FORENSWEEP_INVESTIGATOR_PASSWORD`

Without them, development-only passwords are used and printed here for local setup:

- `admin` / `ForenSweep-Admin-Dev-Only!2026`
- `operator` / `ForenSweep-Operator-Dev-Only!2026`
- `investigator` / `ForenSweep-Investigator-Dev-Only!2026`

Run database commands from the repository root:

```bash
bun run --cwd packages/db db:generate
bun run --cwd packages/db db:migrate
bun run --cwd packages/db db:seed
bun run --cwd packages/db db:studio
```
