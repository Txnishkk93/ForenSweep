from __future__ import annotations

import re
import json
import logging
from pathlib import Path

from ..api_client import WorkerApiClient
from ..config import Config
from ..recovery.carver import scan_and_carve

_LOGGER = logging.getLogger(__name__)


def _job_directory(root: Path, job_id: str) -> Path:
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", job_id):
        raise ValueError("Invalid job ID")
    return (root / "recovery" / job_id).resolve()


def run_recovery(job_id: str, config: Config, client: WorkerApiClient) -> None:
    context = client.context(job_id)["data"]
    job = context["job"]
    device = context.get("device") or {}
    raw_path = job.get("sourceImagePath") or device.get("path")
    if not isinstance(raw_path, str):
        raise ValueError("Worker context does not contain a managed image reference")
    from .erase_job import validate_image_target
    if raw_path.startswith("managed-image:"):
        image_id = raw_path.removeprefix("managed-image:")
        if not re.fullmatch(r"[0-9a-fA-F-]{36}", image_id):
            raise ValueError("Invalid managed image reference")
        raw_path = str(config.safe_image_root / f"{image_id}.img")
    source = validate_image_target(raw_path, config.safe_image_root)
    if source.stat().st_size > config.max_image_size:
        raise ValueError("Source image exceeds the configured maximum size")
    output_dir = _job_directory(config.output_root, job_id)
    scan_type = str(job.get("scanType") or "QUICK").upper()
    if scan_type not in {"QUICK", "DEEP"}:
        raise ValueError(f"Unsupported recovery scan type: {scan_type}")
    _LOGGER.info(json.dumps({"event": "recovery_scan_started", "jobId": job_id, "scanType": scan_type, "source": str(source), "sourceBytes": source.stat().st_size}))
    client.audit(job_id, {"action": "RECOVERY_STARTED", "detail": {"formats": ["JPEG", "PDF", "PNG", "ZIP", "DOCX"], "scanType": scan_type, "simulated": True}})
    client.progress(job_id, {"stage": "CARVING", "progress": 1, "progressDetail": {"simulated": True, "formats": ["JPEG", "PDF", "PNG", "ZIP", "DOCX"]}})
    results = scan_and_carve(source, output_dir, chunk_size=config.chunk_size, max_candidates=config.max_candidates, max_duration_seconds=config.max_duration_seconds, max_extraction_size=config.max_extraction_size, scan_type=scan_type)
    for result in results:
        client.recovered_file(job_id, result)
    client.progress(job_id, {"stage": "VALIDATING", "progress": 99, "progressDetail": {"simulated": True, "candidateCount": len(results)}})
    client.complete(job_id, {"verified": True, "verificationData": {"recoveredCandidateCount": len(results), "formats": ["JPEG", "PDF", "PNG", "ZIP", "DOCX"], "scanType": scan_type}})
    client.audit(job_id, {"action": "RECOVERY_COMPLETED", "detail": {"candidateCount": len(results), "simulated": True}})