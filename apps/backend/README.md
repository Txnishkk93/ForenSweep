# ForenSweep SIH Demo Runbook

ForenSweep is a safe, simulation-first forensic workflow. The API, Prisma database, BullMQ queues, Python worker, and authenticated Socket.IO service are wired for a judge-visible demo without physical-drive access.

## Architecture

```mermaid
flowchart LR
  Web[Next.js web] -->|JWT REST| API[Express backend]
  Web -->|JWT Socket.IO| WS[Authenticated WS]
  API --> DB[(PostgreSQL / Prisma)]
  API --> Redis[(Redis / BullMQ)]
  Redis --> Worker[Python forensic worker]
  Worker -->|private token| API
  Worker -->|safe image read-only| IMG[SAFE_IMAGE_ROOT .img]
  Worker --> OUT[SAFE_OUTPUT_ROOT job outputs]
  API --> DB
  WS --> Redis
```

## Setup

Requirements: Bun 1.3.9, Node 24+, Python 3.11+, Docker Desktop.

```powershell
bun install
docker compose up -d postgres redis
Copy-Item apps/backend/.env.example apps/backend/.env
Copy-Item apps/forensic-worker/.env.example apps/forensic-worker/.env
$env:DATABASE_URL = "postgresql://forensweep:forensweep-dev-only@localhost:55432/forensweep"
$env:JWT_SECRET = "forensweep-demo-jwt-secret-32-characters-minimum"
$env:INTERNAL_WORKER_TOKEN = "forensweep-demo-worker-token-32-characters-min"
bun run --cwd packages/db db:generate
bun run --cwd packages/db db:migrate
bun run --cwd packages/db db:seed
```

Set `DATABASE_URL` in `apps/backend/.env` to `postgresql://forensweep:forensweep-dev-only@localhost:55432/forensweep`. Use the same `INTERNAL_WORKER_TOKEN` and `SAFE_IMAGE_ROOT` values in both env files. Generate local certificate keys; never commit them:

```powershell
cd apps/forensic-worker
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .
python scripts/generate_dev_key.py
cd ../..
```

Start each process in a separate terminal:

```powershell
bun run --cwd apps/backend dev
bun run --cwd apps/backend worker
bun run --cwd apps/ws dev
```

## Seed Accounts

| Username       | Role         | Development password                    |
| -------------- | ------------ | --------------------------------------- |
| `admin`        | ADMIN        | `ForenSweep-Admin-Dev-Only!2026`        |
| `operator`     | OPERATOR     | `ForenSweep-Operator-Dev-Only!2026`     |
| `investigator` | INVESTIGATOR | `ForenSweep-Investigator-Dev-Only!2026` |

Override with `FORENSWEEP_ADMIN_PASSWORD`, `FORENSWEEP_OPERATOR_PASSWORD`, and `FORENSWEEP_INVESTIGATOR_PASSWORD` before seeding.

## Exact Demo Script

1. Create safe synthetic inputs:

```powershell
cd apps/forensic-worker
python scripts/create_demo_image.py --size-mb 1
python scripts/create_recovery_sample_image.py
cd ../..
```

2. Login:

```powershell
$login = Invoke-RestMethod -Method Post http://localhost:4000/api/auth/login -ContentType 'application/json' -Body '{"identifier":"admin","password":"ForenSweep-Admin-Dev-Only!2026"}'
$token = $login.data.accessToken
$headers = @{ Authorization = "Bearer $token" }
```

3. Inspect seeded device profiles and SSD policy warnings:

```powershell
Invoke-RestMethod http://localhost:4000/api/devices -Headers $headers
Invoke-RestMethod http://localhost:4000/api/devices/00000000-0000-4000-8000-000000000102/profile -Headers $headers
```

4. Create an operator erase request using the HDD serial confirmation, approve it as admin, and observe simulation progress:

```powershell
$erase = Invoke-RestMethod -Method Post http://localhost:4000/api/jobs/erase -Headers $headers -ContentType 'application/json' -Body '{"deviceId":"00000000-0000-4000-8000-000000000101","eraseScope":"WHOLE_DRIVE","typeToConfirm":"MOCK-HDD-001"}'
$jobId = $erase.data.id
Invoke-RestMethod -Method Post "http://localhost:4000/api/jobs/$jobId/approve" -Headers $headers
Invoke-RestMethod "http://localhost:4000/api/jobs/$jobId" -Headers $headers
Invoke-RestMethod "http://localhost:4000/api/jobs/$jobId/certificate" -Headers $headers
```

5. Verify the certificate by submitting its payload, hash, and signature to `POST /api/certificates/verify`. Change one payload field and repeat; the edited payload must fail hash verification.

6. Create a recovery job against the registered safe image, then inspect results and export one authorized result:

```powershell
$recovery = Invoke-RestMethod -Method Post http://localhost:4000/api/jobs/recover -Headers $headers -ContentType 'application/json' -Body '{"deviceId":"00000000-0000-4000-8000-000000000105","scanType":"DEEP"}'
$recoveryId = $recovery.data.id
Invoke-RestMethod "http://localhost:4000/api/jobs/$recoveryId/recovered-files" -Headers $headers
Invoke-RestMethod -Method Post "http://localhost:4000/api/recovered-files/<file-id>/export" -Headers $headers
```

Connect Socket.IO with `auth.token`, emit `job:subscribe` with the job ID, and capture `job:progress`, `job:status`, `job:completed`, and `job:failed` events.

## Demo Checklist

- [ ] Docker PostgreSQL and Redis are healthy.
- [ ] Prisma migration and seed completed.
- [ ] Backend, worker, and WS processes are running.
- [ ] `REAL_DEVICE_OPERATIONS=false` is visible in both env files.
- [ ] HDD preview recommends multi-pass overwrite.
- [ ] SATA SSD preview recommends ATA secure erase.
- [ ] NVMe overwrite request is rejected with a warning.
- [ ] USB/SD response shows limited assurance.
- [ ] Erase confirmation and admin approval are visible.
- [ ] Simulation progress reaches completion.
- [ ] Certificate verifies, then fails after payload editing.
- [ ] Recovery returns JPEG/PNG/PDF/DOCX metadata where present.
- [ ] Confidence, offsets, SHA-256, truncation, and preview fields are visible.
- [ ] Authorized export succeeds; unauthorized export fails.
- [ ] WebSocket room subscription is ownership/admin protected.

## Troubleshooting

- **Backend rejects env:** copy `.env.example`, use 32+ character JWT and worker secrets, and keep `REAL_DEVICE_OPERATIONS=false`.
- **Windows device discovery:** PowerShell disk discovery runs with `-NoProfile -NonInteractive -ExecutionPolicy Bypass` and does not require Administrator privileges on the supported demo path. If Windows returns no devices or discovery times out, the API returns an empty device list and logs the PowerShell stderr/detail; use Rescan after checking the backend log. Some enterprise policies or protected system-disk configurations may still require running the backend elevated.
- **Queue does not progress:** confirm Redis is running and the separate backend worker terminal is active.
- **Worker cannot reach API:** verify `BACKEND_INTERNAL_URL` and matching `INTERNAL_WORKER_TOKEN`.
- **Certificate signing fails:** run `python scripts/generate_dev_key.py`, set `CERT_PRIVATE_KEY_PATH` for Python and the matching `CERT_PUBLIC_KEY_PATH` for backend.
- **No recovery candidates:** ensure the registered device points to a `.img` under `SAFE_IMAGE_ROOT`; use `create_recovery_sample_image.py`.
- **PDF/JPEG parser is low confidence:** the scanner is conservative and does not reconstruct fragments.
- **WS connection fails:** confirm `apps/ws` is running on `WS_PORT=4001` and connect with the JWT in Socket.IO `auth.token`.

## Safety and Limitations

- Physical-device operations are disabled by default and are not implemented in this demo.
- SSD secure erase, NVMe sanitize, crypto erase, and flash-media sanitization are policy recommendations/stubs only.
- Software overwrite cannot prove physical-cell sanitization on SSD, USB, or SD media.
- All erasure is simulation-only and restricted to safe `.img` test images.
- Recovery is read-only and supports JPEG, PNG, PDF, ZIP/DOCX carving only.
- Fragment reconstruction, macros, execution, thumbnails for non-images, and arbitrary file access are not implemented.
- Certificates describe the test image and sampled verification regions; they are not an absolute physical-media guarantee.
