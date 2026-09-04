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