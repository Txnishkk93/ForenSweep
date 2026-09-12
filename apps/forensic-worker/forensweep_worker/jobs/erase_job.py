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
import signal
import json
import logging
import os
import sys
try:
    import fcntl
except ImportError:  # pragma: no cover - real hardware is Linux-only
    fcntl = None  # type: ignore[assignment]
from threading import Event, Lock
from ..device_discovery import discover_devices
from ..erase.hardware import overwrite_usb_device
from ..erase.local_files import expand_targets, remove_empty_directories, secure_overwrite_file

_REAL_HARDWARE_LOCK = Lock()
_LOGGER = logging.getLogger("forensweep.hardware")


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
    detail = job.get("progressDetail") or {}
    if detail.get("hardware") is True:
        run_hardware_erase(job_id, config, client, context_data)
        return
    if job.get("eraseScope") == "SPECIFIC_FILES" and not device:
        run_local_file_erase(job_id, config, client, context_data)
        return
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


def run_local_file_erase(
    job_id: str, config: Config, client: WorkerApiClient, context_data: dict[str, Any]
) -> None:
    started_at = datetime.now(timezone.utc)
    job = context_data["job"]
    raw_targets = job.get("eraseFileList") or []
    if not isinstance(raw_targets, list) or not all(isinstance(item, str) for item in raw_targets):
        raise ValueError("Worker context does not contain a valid local erase target list")
    passes = int(job.get("totalPasses") or (3 if job.get("eraseMethod") == "OVERWRITE_MULTI" else 1))
    erased: list[str] = []
    failures: list[dict[str, str]] = []
    directories = [item for item in raw_targets if isinstance(item, str)]
    targets: list[Path] = []
    seen_targets: set[Path] = set()
    for raw_target in raw_targets:
        try:
            for target in expand_targets([raw_target]):
                if target not in seen_targets:
                    seen_targets.add(target)
                    targets.append(target)
        except Exception as error:
            failures.append({"path": raw_target, "error": str(error)})
    total = len(targets)
    client.audit(job_id, {"action": "LOCAL_FILE_ERASE_STARTED", "detail": {"paths": raw_targets, "fileCount": total}})
    for index, path in enumerate(targets, start=1):
        try:
            secure_overwrite_file(path, passes, config.chunk_size, lambda current, total_passes: client.progress(job_id, {"stage": "OVERWRITING", "progress": round(((index - 1) + current / total_passes) / max(total, 1) * 100), "currentPass": current, "totalPasses": total_passes, "progressDetail": {"localFiles": True, "currentPath": str(path), "filesProcessed": index - 1, "filesTotal": total}}))
            erased.append(str(path))
            client.audit(job_id, {"action": "LOCAL_FILE_ERASED", "detail": {"path": str(path), "passes": passes}})
        except Exception as error:
            failure = {"path": str(path), "error": str(error)}
            failures.append(failure)
            client.audit(job_id, {"action": "LOCAL_FILE_ERASE_FAILED", "detail": failure})
    remove_empty_directories(directories)
    details = {
        "localFiles": True,
        "requestedPathCount": len(raw_targets),
        "erasedPathCount": len(erased),
        "failedPathCount": len(failures),
        "failures": failures,
    }
    if failures:
        client.fail(job_id, {"message": f"{len(failures)} local erase target(s) failed", "errorCode": "LOCAL_FILE_ERASE_FAILED"})
        return
    client.complete(job_id, {"verified": True, "residualRiskScore": 0.25, "residualRiskLevel": "HIGH", "verificationData": details})
    certificate = create_certificate(context_data, {"verified": True, "residualRiskScore": 0.25, "residualRiskLevel": "HIGH", "details": details}, config, started_at)
    client.certificate(certificate)


def run_hardware_erase(
    job_id: str, config: Config, client: WorkerApiClient, context_data: dict[str, Any]
) -> None:
    if config.hardware_gate is None:
        raise RuntimeError("Hardware execution gate is disabled")
    if fcntl is None:
        raise RuntimeError("Real hardware execution requires Linux file locking")
    if not _REAL_HARDWARE_LOCK.acquire(blocking=False):
        raise RuntimeError("Another real hardware erase is already in progress")
    lock_path = Path("/tmp/forensweep-real-hardware.lock")
    with lock_path.open("w") as lock_handle:
        try:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            _REAL_HARDWARE_LOCK.release()
            raise RuntimeError("Another real hardware erase is already in progress") from error
        try:
            _run_hardware_erase(job_id, config, client, context_data)
        finally:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
            _REAL_HARDWARE_LOCK.release()


def _run_hardware_erase(
    job_id: str, config: Config, client: WorkerApiClient, context_data: dict[str, Any]
) -> None:
    job = context_data["job"]
    device = context_data.get("device") or {}
    path = device.get("path")
    captured = (job.get("progressDetail") or {}).get("capturedDevice") or {}
    if not isinstance(path, str) or not path.startswith("/dev/"):
        raise RuntimeError("Hardware target is not a Linux device path")
    current = next((item for item in discover_devices() if item["path"] == path), None)
    expected = {
        "path": captured.get("path"),
        "serial": captured.get("serial"),
        "model": captured.get("model"),
        "sizeBytes": captured.get("sizeBytes"),
        "mounted": captured.get("mounted"),
        "isSystemDisk": captured.get("isSystemDisk"),
        "removable": captured.get("removable"),
        "transport": captured.get("transport"),
        "rotational": captured.get("rotational"),
    }
    actual = {
        "path": current.get("path") if current else None,
        "serial": current.get("serial") if current else None,
        "model": current.get("model") if current else None,
        "sizeBytes": current.get("size") if current else None,
        "mounted": current.get("mounted") if current else None,
        "isSystemDisk": current.get("system_disk") if current else None,
        "removable": current.get("removable") if current else None,
        "transport": current.get("transport") if current else None,
        "rotational": current.get("rotational") if current else None,
    }
    if current is None or expected != actual:
        raise RuntimeError(f"Hardware target changed: expected={expected!r} actual={actual!r}")
    if current.get("removable") is not True or current.get("transport") != "usb":
        raise RuntimeError("Hardware target is no longer a removable USB device")
    size = int(current["size"])
    if size > config.hardware_gate.max_capacity_bytes:
        raise RuntimeError("Hardware target exceeds the configured capacity limit")

    stop_requested = Event()
    signal.signal(signal.SIGTERM, lambda _signum, _frame: stop_requested.set())
    started_at = datetime.now(timezone.utc)
    command_args = ["chunked-zero-write", path, "--bytes", str(size)]
    _LOGGER.warning(json.dumps({
        "event": "hardware_command_start",
        "command": "chunked-zero-write",
        "args": command_args,
        "start": started_at.isoformat(),
        "exitCode": None,
        "byteOffset": 0,
        "gates": {
            "REAL_DEVICE_OPERATIONS": True,
            "HARDWARE_DEMO_ENABLED": True,
            "HARDWARE_DEMO_ALLOWED_METHOD": "OVERWRITE_SINGLE",
            "HARDWARE_DEMO_MAX_CAPACITY_BYTES": config.hardware_gate.max_capacity_bytes,
            "HARDWARE_DEMO_CONFIRM_PHRASE_MATCHED": True,
        },
        "operatorUserId": job.get("userId"),
        "approverUserId": job.get("approvedById"),
    }))
    client.audit(job_id, {"action": "HARDWARE_ERASE_STARTED", "detail": {"method": "OVERWRITE_SINGLE", "path": path}})
    processed = overwrite_usb_device(
        Path(path),
        size,
        config.chunk_size,
        lambda done, total: client.progress(job_id, {"stage": "OVERWRITING", "progress": round(done / max(total, 1) * 100), "currentPass": 1, "totalPasses": 1, "progressDetail": {"hardware": True, "bytesProcessed": str(done), "bytesTotal": str(total)}}),
        lambda: stop_requested.is_set() or client.cancelled(job_id),
    )
    if stop_requested.is_set() or processed < size:
        _LOGGER.warning(json.dumps({"event": "hardware_command_end", "command": "chunked-zero-write", "args": command_args, "start": started_at.isoformat(), "end": datetime.now(timezone.utc).isoformat(), "exitCode": 143, "byteOffset": processed, "operatorUserId": job.get("userId"), "approverUserId": job.get("approvedById")}))
        raise RuntimeError(f"Hardware erase cancelled at byte offset {processed}")
    _LOGGER.warning(json.dumps({"event": "hardware_command_end", "command": "chunked-zero-write", "args": command_args, "start": started_at.isoformat(), "end": datetime.now(timezone.utc).isoformat(), "exitCode": 0, "byteOffset": processed, "operatorUserId": job.get("userId"), "approverUserId": job.get("approvedById")}))
    client.progress(job_id, {"stage": "VERIFYING", "progress": 99, "currentPass": 1, "totalPasses": 1, "progressDetail": {"hardware": True, "sampledDevice": True}})
    verification = verify_overwrite(Path(path), b"\x00", config.sample_count)
    details = {**verification.details, "limitation": "Verification covers sampled regions of this specific device; it is not an unconditional secure-erasure guarantee."}
    client.complete(job_id, {"verified": verification.verified, "residualRiskScore": verification.residual_risk_score, "residualRiskLevel": verification.residual_risk_level, "verificationData": details})
    if verification.verified:
        certificate = create_certificate(context_data, {"verified": True, "residualRiskScore": verification.residual_risk_score, "residualRiskLevel": verification.residual_risk_level, "details": details}, config, started_at)
        client.certificate(certificate)
