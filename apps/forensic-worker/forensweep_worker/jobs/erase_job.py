from __future__ import annotations

from pathlib import Path
from typing import Any

from ..api_client import WorkerApiClient
from ..config import Config
from ..models import WorkerContext
from ..erase.simulated import simulate_overwrite
from ..erase.verification import verify_overwrite, overwrite_pattern
from ..certificate import create_certificate
from datetime import datetime, timezone


def validate_image_target(raw_path: str, safe_root: Path) -> Path:
    candidate = Path(raw_path)
    if raw_path.startswith("SAFE_IMAGE_ROOT/"):
        candidate = safe_root / raw_path.removeprefix("SAFE_IMAGE_ROOT/")
    if candidate.is_symlink() or candidate.is_dir() or candidate.suffix.lower() != ".img":
        raise ValueError("Only regular .img files are allowed")
    if any(parent.is_symlink() for parent in candidate.parents):
        raise ValueError("Symlinked image paths are not allowed")
    resolved = candidate.resolve(strict=True)
    if resolved.is_symlink() or not resolved.is_file() or safe_root not in resolved.parents:
        raise ValueError("Image path must be a regular file inside SAFE_IMAGE_ROOT")
    return resolved


def run_erase(job_id: str, config: Config, client: WorkerApiClient) -> None:
    started_at = datetime.now(timezone.utc)
    context_data = client.context(job_id)["data"]
    job = context_data["job"]
    device = context_data.get("device")
    raw_path = job.get("sourceImagePath") or (device or {}).get("path")
    if not isinstance(raw_path, str):
        raise ValueError("Worker context does not contain a managed image reference")
    image_path = validate_image_target(raw_path, config.safe_image_root)
    total_passes = int(job.get("totalPasses") or (3 if job.get("eraseMethod") == "OVERWRITE_MULTI" else 1))

    def progress(current_pass: int, passes: int, processed: int, total: int, stage: str) -> None:
        client.progress(job_id, {"stage": stage, "progress": round((processed / max(total, 1)) * 100), "currentPass": current_pass, "totalPasses": passes, "progressDetail": {"simulated": True, "bytesProcessed": str(processed), "bytesTotal": str(total)}})

    client.audit(job_id, {"action": "WORKER_ERASE_STARTED", "detail": {"simulated": True}})
    simulate_overwrite(image_path, config.chunk_size, total_passes, progress)
    client.progress(job_id, {"stage": "VERIFYING", "progress": 99, "currentPass": total_passes, "totalPasses": total_passes, "progressDetail": {"simulated": True}})
    verification = verify_overwrite(image_path, overwrite_pattern(total_passes), config.sample_count)
    client.complete(job_id, {"verified": verification.verified, "residualRiskScore": verification.residual_risk_score, "residualRiskLevel": verification.residual_risk_level, "verificationData": verification.details})
    if verification.verified:
        certificate = create_certificate(context_data, {"verified": verification.verified, "residualRiskScore": verification.residual_risk_score, "residualRiskLevel": verification.residual_risk_level, "details": verification.details}, config, started_at)
        client.certificate(certificate)
