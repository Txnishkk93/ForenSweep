# ForenSweep Deployment: Vercel + Railway or Render

This guide deploys the Next.js web app to Vercel and the API stack to Railway or Render.

ForenSweep currently has these runtime components:

```text
Vercel          Next.js web app
Railway/Render  Express API
Railway/Render  BullMQ worker
Railway/Render  Socket.IO service
Railway/Render  PostgreSQL
Railway/Render  Redis
```

The BullMQ worker starts the Python forensic worker as a child process. The worker service must therefore contain Python 3.11+, the `apps/forensic-worker` package, the certificate private key, and access to the same image/output storage as the API service.

This project is simulation-first. Keep `REAL_DEVICE_OPERATIONS=false`. It does not implement physical-drive sanitization.

## 1. Prepare the repository

Push the repository to GitHub or another Git provider. Do not commit:

- `.env` files
- private certificate keys
- uploaded images
- generated recovery output
- production passwords or tokens

The repository currently has no production Dockerfiles. For Railway or Render, use a custom Docker image for the API and BullMQ worker so Node, Bun, Python, and the forensic package are available together.

## 2. Create the database and Redis services

Choose one provider for the backend infrastructure:

### Railway

1. Create a new Railway project.
2. Add a PostgreSQL service.
3. Add a Redis service or Railway Redis plugin.
4. Copy the generated connection strings. You will use them as `DATABASE_URL` and `REDIS_URL`.
5. Keep both services private. Do not expose PostgreSQL or Redis to the public internet.

### Render

1. Create a Render PostgreSQL database.
2. Create a Render Redis-compatible key-value service, or use an external Redis provider.
3. Use the internal database and Redis URLs when available. Do not use public URLs between services in the same provider unless required.
4. Keep database and Redis credentials in the provider's secret environment-variable store.

## 3. Generate production secrets and certificate keys

Generate two unrelated secrets locally:

```powershell
openssl rand -hex 32
openssl rand -hex 32
```

Use the first value as `JWT_SECRET` and the second as `INTERNAL_WORKER_TOKEN`.

Generate the certificate pair locally:

```powershell
cd apps/forensic-worker
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .
python scripts/generate_dev_key.py
```

Keep the generated private key secret. The public key is needed by the API and the private key is needed by the BullMQ worker.

## 4. Configure the backend environment

Add these variables to both the API service and the BullMQ worker service. Replace every placeholder.

```env
NODE_ENV=production
PORT=4000
WS_PORT=4001

DATABASE_URL=postgresql://...
REDIS_URL=redis://...

JWT_SECRET=at-least-32-random-characters
JWT_EXPIRES_IN=8h
INTERNAL_WORKER_TOKEN=another-at-least-32-random-secret

SAFE_IMAGE_ROOT=/var/lib/forensweep/safe-images
SAFE_OUTPUT_ROOT=/var/lib/forensweep/output
REAL_DEVICE_OPERATIONS=false
CORS_ORIGIN=https://YOUR-VERCEL-DOMAIN.vercel.app
LOG_LEVEL=info

CERT_PUBLIC_KEY_PATH=/app/apps/backend/secrets/forensweep-ed25519-public.pem
PROTECTED_DEVICES_PATH=/app/apps/backend/protected-devices.json

HARDWARE_DEMO_ENABLED=false
HARDWARE_DEMO_ALLOWED_METHOD=OVERWRITE_SINGLE
```

Add these variables to the BullMQ worker service as well:

```env
BACKEND_INTERNAL_URL=http://api:4000
INTERNAL_WORKER_TOKEN=the-same-value-used-by-the-api
SAFE_IMAGE_ROOT=/var/lib/forensweep/safe-images
SAFE_OUTPUT_ROOT=/var/lib/forensweep/output
CERT_PRIVATE_KEY_PATH=/app/apps/backend/secrets/forensweep-ed25519-private.pem
WORKER_CHUNK_SIZE=1048576
WORKER_SAMPLE_COUNT=16
MAX_IMAGE_SIZE=1073741824
MAX_CANDIDATES=100
MAX_CANDIDATE_EXTRACTION_SIZE=52428800
MAX_SCAN_DURATION_SECONDS=60
```

If the provider does not support the private service hostname `api:4000`, set `BACKEND_INTERNAL_URL` to the API service's private URL.

## 5. Configure persistent storage

The API receives `.img` and `.zip` uploads and the worker writes recovered files and certificates. Provider-local disks are usually ephemeral, so configure a persistent volume mounted at:

```text
/var/lib/forensweep
```

Both the API service and BullMQ worker service must see the same storage. If shared volumes are unavailable, use object storage and update the upload/output implementation before production use; separate ephemeral disks will make jobs and exports unreliable.

For a demo, generate safe test data inside the mounted image directory:

```powershell
python apps/forensic-worker/scripts/create_demo_image.py --size-mb 1
python apps/forensic-worker/scripts/create_recovery_sample_image.py
```

Copy the resulting `.img` files to the deployed `SAFE_IMAGE_ROOT` volume using the provider shell or an administrative upload workflow.

## 6. Deploy the API service

Create a service from the repository.

Use the repository root as the build context. The API service must:

1. Install Bun dependencies.
2. Install Python 3.11 and the forensic worker package.
3. Copy the certificate keys into the image or mount them as secrets.
4. Run Prisma generation and compile the TypeScript packages.

The production start command is:

```bash
bun run --cwd apps/backend start
```

Expose the provider-assigned `PORT` and configure the health check as:

```text
/health
```

The API is healthy when it returns JSON with `success: true` and `status: "ok"`.

Do not run database migrations on every API restart. Run migrations once as a release/deploy command:

```bash
bun run --cwd packages/db db:generate
bun run --cwd packages/db db:migrate
```

## 7. Deploy the BullMQ worker service

Create a second service from the same repository and the same runtime image as the API. It must have:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `INTERNAL_WORKER_TOKEN`
- all Python worker variables
- the certificate private key
- the shared `/var/lib/forensweep` volume

Use this start command:

```bash
bun run --cwd apps/backend worker
```

This process consumes BullMQ jobs and launches Python. It must remain running continuously. Do not configure it as a short-lived one-off job.

## 8. Deploy the Socket.IO service

Create a third service from the repository. It needs:

- `REDIS_URL`
- `JWT_SECRET`
- `CORS_ORIGIN=https://YOUR-VERCEL-DOMAIN.vercel.app`
- `WS_PORT` set to the provider's assigned port if required

Use this build command:

```bash
bun run --cwd apps/ws build
```

Use this start command:

```bash
bun run --cwd apps/ws start
```

Expose the Socket.IO service publicly. The frontend uses a secure WebSocket URL such as:

```text
wss://ws-YOUR-DOMAIN.example.com
```

Enable WebSocket support in the Railway or Render service settings. The Socket.IO path is `/socket.io/`.

## 9. Run the initial seed

Set these only for the initial seed operation:

```env
FORENSWEEP_ADMIN_PASSWORD=strong-admin-password
FORENSWEEP_OPERATOR_PASSWORD=strong-operator-password
FORENSWEEP_INVESTIGATOR_PASSWORD=strong-investigator-password
```

Run:

```bash
bun run --cwd packages/db db:seed
```

Remove or rotate any temporary seed variables after the seed completes.

## 10. Deploy the web app to Vercel

1. Import the repository into Vercel.
2. Select `apps/web` as the Root Directory.
3. Keep the framework set to Next.js.
4. Set the build command to `bun run build` or `next build`.
5. Set the install command to `bun install`.
6. Add these production environment variables:

```env
NEXT_PUBLIC_API_BASE_URL=https://YOUR-API-DOMAIN.example.com
NEXT_PUBLIC_WS_URL=wss://YOUR-WS-DOMAIN.example.com
```

`NEXT_PUBLIC_API_BASE_URL` should be the API origin without an extra `/api` unless the code explicitly expects it. The current client builds API paths under `/api`.

7. Deploy the site.
8. Copy the final Vercel domain into `CORS_ORIGIN` on both the API and Socket.IO services.
9. Redeploy the API and Socket.IO services after changing `CORS_ORIGIN`.

Use a custom domain in production. Add that exact domain to `CORS_ORIGIN`, for example:

```env
CORS_ORIGIN=https://app.example.com
```

## 11. Verify the deployment

Check the API:

```powershell
Invoke-RestMethod https://YOUR-API-DOMAIN.example.com/health
```

Then verify in the browser:

1. The Vercel site opens at `/login`.
2. Admin login succeeds.
3. The dashboard loads devices from the API.
4. A recovery upload completes.
5. A recovery job moves from queued to completed.
6. An erase simulation completes.
7. Job progress events appear through Socket.IO.
8. A certificate can be generated and verified.

Check provider logs if a job remains queued:

- API logs should show job creation.
- Redis should be reachable from the API, worker, and Socket.IO service.
- BullMQ worker logs should show the job being consumed.
- Worker logs should show Python starting successfully.
- `BACKEND_INTERNAL_URL` and `INTERNAL_WORKER_TOKEN` must match.

## 12. Railway versus Render

Railway is usually the shorter setup for this repository because PostgreSQL, Redis, private service networking, and persistent volumes are available in one project.

Render works too, but plan the services explicitly:

| Service | Type | Start command |
| --- | --- | --- |
| API | Web Service | `bun run --cwd apps/backend start` |
| BullMQ | Background Worker | `bun run --cwd apps/backend worker` |
| Socket.IO | Web Service | `bun run --cwd apps/ws start` |
| Web | Vercel | `next build` / `next start` |

The API and BullMQ worker must use compatible images, environment variables, certificate secrets, and shared storage. A Render web service alone will not process queued jobs.

## Production checklist

- [ ] Vercel environment variables use production API and WebSocket URLs.
- [ ] `CORS_ORIGIN` exactly matches the Vercel origin.
- [ ] API, BullMQ worker, and Socket.IO are separate long-running services.
- [ ] `DATABASE_URL` and `REDIS_URL` work from every backend service.
- [ ] API and BullMQ worker share persistent image/output storage.
- [ ] Python 3.11 and `forensweep-worker` are installed in the worker runtime.
- [ ] Certificate public/private keys are present at the configured paths.
- [ ] Prisma migration and seed completed.
- [ ] `REAL_DEVICE_OPERATIONS=false`.
- [ ] PostgreSQL, Redis, API, and worker logs contain no connection errors.
- [ ] `/health` returns successfully.
- [ ] Recovery, erase simulation, certificate verification, and WebSocket updates work.