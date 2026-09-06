from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class Config:
    backend_internal_url: str
    internal_worker_token: str
    safe_image_root: Path
    real_device_operations: bool
    chunk_size: int
    sample_count: int
    cert_private_key_path: Path
    output_root: Path
    max_image_size: int
    max_candidates: int
    max_duration_seconds: int
    max_extraction_size: int
    hardware_gate: "HardwareGate | None"


@dataclass(frozen=True, slots=True)
class HardwareGate:
    max_capacity_bytes: int
    confirm_phrase: str


def load_config() -> Config:
    root = Path(os.environ.get("SAFE_IMAGE_ROOT", "../../storage/safe-images")).expanduser().resolve()
    real_operations = os.environ.get("REAL_DEVICE_OPERATIONS", "false").lower() == "true"
    token = os.environ.get("INTERNAL_WORKER_TOKEN", "")
    if not token:
        raise RuntimeError("INTERNAL_WORKER_TOKEN is required")
    gate_values = (
        os.environ.get("REAL_DEVICE_OPERATIONS", "false").lower() == "true",
        os.environ.get("HARDWARE_DEMO_ENABLED", "false").lower() == "true",
        os.environ.get("HARDWARE_DEMO_ALLOWED_METHOD") == "OVERWRITE_SINGLE",
        os.environ.get("HARDWARE_DEMO_MAX_CAPACITY_BYTES"),
        os.environ.get("HARDWARE_DEMO_CONFIRM_PHRASE"),
    )
    hardware_gate = None
    if all(gate_values):
        try:
            max_capacity = int(gate_values[3])
            if max_capacity > 0:
                hardware_gate = HardwareGate(max_capacity, str(gate_values[4]))
        except (TypeError, ValueError):
            hardware_gate = None
    if real_operations and hardware_gate is None:
        raise RuntimeError("REAL_DEVICE_OPERATIONS requires all hardware demo gates")
    return Config(
        backend_internal_url=os.environ.get("BACKEND_INTERNAL_URL", "http://localhost:4000").rstrip("/"),
        internal_worker_token=token,
        safe_image_root=root,
        real_device_operations=real_operations,
        chunk_size=int(os.environ.get("WORKER_CHUNK_SIZE", str(1024 * 1024))),
        sample_count=int(os.environ.get("WORKER_SAMPLE_COUNT", "16")),
        cert_private_key_path=Path(os.environ.get("CERT_PRIVATE_KEY_PATH", "./secrets/forensweep-ed25519-private.pem")).expanduser().resolve(),
        output_root=Path(os.environ.get("SAFE_OUTPUT_ROOT", "../../storage/output")).expanduser().resolve(),
        max_image_size=int(os.environ.get("MAX_IMAGE_SIZE", str(1024 * 1024 * 1024))),
        max_candidates=int(os.environ.get("MAX_CANDIDATES", "100")),
        max_duration_seconds=int(os.environ.get("MAX_SCAN_DURATION_SECONDS", "60")),
        max_extraction_size=int(os.environ.get("MAX_CANDIDATE_EXTRACTION_SIZE", str(50 * 1024 * 1024))),
        hardware_gate=hardware_gate,
    )
