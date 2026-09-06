# ForenSweep Forensic Worker

This Python 3.11+ package is a safe, image-only Module A scaffold. Python receives only an internal `jobId`, fetches the managed job context from Node using `INTERNAL_WORKER_TOKEN`, and reports progress/results to private Node endpoints. Node and Prisma remain the database authority.

Only regular `.img` files inside `SAFE_IMAGE_ROOT` are accepted. Symlinks, directories, non-image files, paths outside the safe root, physical devices, shell commands, and destructive device tools are rejected. `REAL_DEVICE_OPERATIONS=false` is mandatory in this phase.

The currently implemented operation is simulated chunked overwrite of a test image. It supports single or multi-pass patterns, uses a default 1 MiB chunk size, calls `fsync` after each pass, and verifies deterministic sampled regions. Verification applies to the test image and sampled regions; it is not an absolute physical-media claim.

```bash
python -m venv .venv
.venv\\Scripts\\Activate.ps1
pip install -e .
Copy-Item .env.example .env
python scripts/generate_dev_key.py
python scripts/create_demo_image.py --size-mb 1
python -m forensweep_worker.main erase --job-id <uuid>
```

`CERT_PRIVATE_KEY_PATH` is the only source for the signing private key. The development key generator writes local files under ignored `secrets` directories; never commit those files. Set the matching public key path as the backend `CERT_PUBLIC_KEY_PATH`. The backend certificate API re-canonicalizes payloads and verifies Ed25519 signatures.

The ATA, NVMe, cryptographic, and file-level erase modules are explicit disabled stubs. There is no physical-drive access, Python process execution beyond this controlled module entry point, recovery execution, or shell invocation.

## Read-only Linux device discovery

On Linux, the worker can inventory whole block devices and sync them to the
backend without performing any erase operation:

```bash
python -m forensweep_worker.main discover
```

Discovery uses `lsblk --json` with a fixed argument list. It may additionally
run read-only `udevadm`, `smartctl --info`, and `nvme id-ctrl` probes when the
tools are installed. Commands are resolved only from `/bin`, `/usr/bin`,
`/sbin`, and `/usr/sbin`, device paths are strictly validated, and every probe
has a timeout. Probe failure produces conservative capability flags and does
not stop the remaining inventory from syncing. Results are sent to the
worker-authenticated `POST /internal/devices/sync` endpoint.

## Recovery MVP

Create a reproducible, copyright-free image containing synthetic JPEG and PDF markers:

```bash
python scripts/create_recovery_sample_image.py
python -m forensweep_worker.main recover --job-id <recovery-job-uuid>
```

The registered database device or managed image reference must point to that `.img` under `SAFE_IMAGE_ROOT`. The worker reads the source only and writes candidates under `SAFE_OUTPUT_ROOT/recovery/<job-id>`.

End-to-end manual flow:

1. Start PostgreSQL, Redis, backend, WebSocket service, and the backend worker.
2. Log in and create a recovery job using a registered device ID or managed image ID.
3. Confirm the recovery job reaches `COMPLETED` and inspect `GET /api/jobs/<job-id>/recovered-files`.
4. Candidate records contain string offsets, SHA-256, validation notes, score breakdown, confidence, and a job-scoped stored path.
5. Delete the synthetic image and output directory when finished; never use this tool with evidence outside the configured safe image root.