from __future__ import annotations

import re
import json
import logging
import hashlib
import mimetypes
import zipfile
from pathlib import Path

from ..api_client import WorkerApiClient
from ..config import Config
from ..recovery.carver import scan_and_carve

_LOGGER = logging.getLogger(__name__)


def _job_directory(root: Path, job_id: str) -> Path:
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", job_id):
        raise ValueError("Invalid job ID")
    return (root / "recovery" / job_id).resolve()


def _canonical_recovered_file_type(file_name: str) -> str:
    suffix = Path(file_name).suffix.lower()
    mapping = {
        ".jpg": "JPEG",
        ".jpeg": "JPEG",
        ".png": "PNG",
        ".pdf": "PDF",
        ".zip": "ZIP",
        ".docx": "DOCX",
    }
    return mapping.get(suffix, "ZIP")


def _recover_forensic_archive(source: Path, output_dir: Path, max_candidates: int) -> list[dict[str, object]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("format") != "ForenSweep forensic archive" or manifest.get("version") != 1:
            raise ValueError("Unsupported forensic archive format")
        results: list[dict[str, object]] = []
        offset = 0
        for entry in manifest.get("files", []):
            if len(results) >= max_candidates:
                break
            member = entry.get("member")
            file_name = entry.get("fileName")
            if not isinstance(member, str) or not isinstance(file_name, str):
                continue
            data = archive.read(member)
            expected_hash = entry.get("sha256")
            if isinstance(expected_hash, str) and hashlib.sha256(data).hexdigest() != expected_hash:
                raise ValueError(f"Forensic archive hash mismatch for {file_name}")
            safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(file_name).name) or "recovered-file"
            target = output_dir / f"{len(results):08d}-{safe_name}"
            target.write_bytes(data)
            size = len(data)
            file_type = _canonical_recovered_file_type(file_name)
            results.append({
                "fileName": file_name,
                "fileType": file_type,
                "mimeType": mimetypes.guess_type(file_name)[0] or "application/octet-stream",
                "offsetStart": str(offset),
                "offsetEnd": str(offset + size),
                "isFragmented": False,
                "isTruncated": False,
                "fragmentCount": 1,
                "confidenceScore": 1.0,
                "confidenceLevel": "HIGH",
                "scoreBreakdown": {"manifest": 1.0, "sha256": 1.0, "complete": 1.0},
                "validationNotes": {"source": "ForenSweep forensic archive", "originalPath": entry.get("originalPath")},
                "sha256": hashlib.sha256(data).hexdigest(),
                "storedPath": str(target),
                "previewPath": None,
                "previewAvailable": False,
                "fragmentationStatus": "NOT_ATTEMPTED",
            })
            offset += size
        return results


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
    if source.name.endswith(".forensic.zip") and not zipfile.is_zipfile(source):
        raise ValueError("Selected forensic archive is invalid or incomplete; create a new sanitization archive")
    output_dir = _job_directory(config.output_root, job_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    scan_type = str(job.get("scanType") or "QUICK").upper()
    if scan_type not in {"QUICK", "DEEP"}:
        raise ValueError(f"Unsupported recovery scan type: {scan_type}")
    _LOGGER.info(json.dumps({"event": "recovery_scan_started", "jobId": job_id, "scanType": scan_type, "source": str(source), "sourceBytes": source.stat().st_size}))
    client.audit(job_id, {"action": "RECOVERY_STARTED", "detail": {"formats": ["JPEG", "PDF", "PNG", "ZIP", "DOCX"], "scanType": scan_type, "simulated": True}})
    client.progress(job_id, {"stage": "CARVING", "progress": 1, "progressDetail": {"simulated": True, "formats": ["JPEG", "PDF", "PNG", "ZIP", "DOCX"]}})
    results = _recover_forensic_archive(source, output_dir, config.max_candidates) if source.name.endswith(".forensic.zip") else scan_and_carve(source, output_dir, chunk_size=config.chunk_size, max_candidates=config.max_candidates, max_duration_seconds=config.max_duration_seconds, max_extraction_size=config.max_extraction_size, scan_type=scan_type)
    for result in results:
        client.recovered_file(job_id, result)
    client.progress(job_id, {"stage": "VALIDATING", "progress": 99, "progressDetail": {"simulated": True, "candidateCount": len(results)}})
    client.complete(job_id, {"verified": True, "verificationData": {"recoveredCandidateCount": len(results), "formats": ["JPEG", "PDF", "PNG", "ZIP", "DOCX"], "scanType": scan_type}})
    client.audit(job_id, {"action": "RECOVERY_COMPLETED", "detail": {"candidateCount": len(results), "simulated": True}})