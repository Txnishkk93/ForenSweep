from __future__ import annotations

import base64
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def canonical_json(value: Any) -> str:
    return json.dumps(
        normalize_json(value),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def normalize_json(value: Any) -> Any:
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, list):
        return [normalize_json(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize_json(item) for key, item in value.items()}
    return value


def content_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def load_private_key(path: Path) -> Ed25519PrivateKey:
    if not os.environ.get("CERT_PRIVATE_KEY_PATH"):
        raise RuntimeError("CERT_PRIVATE_KEY_PATH is required to sign certificates")
    raw = path.read_bytes()
    key = serialization.load_pem_private_key(raw, password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise RuntimeError("CERT_PRIVATE_KEY_PATH must contain an Ed25519 private key")
    return key


def write_pdf(path: Path, payload: dict[str, Any], digest: str) -> None:
    try:
        from reportlab.lib.pagesizes import LETTER
        from reportlab.pdfgen.canvas import Canvas
    except ImportError:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas = Canvas(str(path), pagesize=LETTER)
    _, height = LETTER
    lines = [
        f"ForenSweep Erasure Certificate: {payload['certificateNumber']}",
        f"Job: {payload['jobId']}",
        f"Device: {payload['deviceSnapshot'].get('model') or 'Unknown'}",
        f"Method: {payload['method']} / {payload['standard']}",
        f"Verification: {payload['verificationResult']}",
        f"Content hash (SHA-256): {digest}",
        "Signature: Ed25519",
        "Limitation: verification covers the test image and sampled regions, not an absolute physical-media claim.",
    ]
    for index, line in enumerate(lines):
        canvas.drawString(54, height - 72 - (index * 24), line[:120])
    canvas.save()


def utc_isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def create_certificate(context: dict[str, Any], verification: dict[str, Any], config: Any, started_at: datetime) -> dict[str, Any]:
    job = context["job"]
    device = context.get("device") or {}
    ended_at = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "certificateNumber": f"FS-{ended_at.strftime('%Y%m%d%H%M%S')}-{job['id'][:8].upper()}",
        "jobId": job["id"],
        "deviceSnapshot": device,
        "method": job.get("eraseMethod") or "UNKNOWN",
        "standard": job.get("standard") or "NIST_800_88",
        "operatorReference": job.get("userId") or "unknown",
        "approvalReference": job.get("approvedById"),
        "startedAt": utc_isoformat(started_at),
        "endedAt": utc_isoformat(ended_at),
        "verificationResult": bool(verification["verified"]),
        "residualRiskScore": float(verification["residualRiskScore"]),
        "residualRiskLevel": verification["residualRiskLevel"],
        "verificationDetail": verification["details"],
        "toolMetadata": {"name": "forensweep-worker", "version": "0.1.0", "mode": "simulated-image"},
        "scope": job.get("eraseScope") or "WHOLE_DRIVE",
        "warnings": [],
        "limitations": ["Verification applies to the test image and sampled regions, not an absolute physical-media claim."],
    }
    digest = content_hash(payload)
    signature = load_private_key(config.cert_private_key_path).sign(digest.encode("utf-8"))
    pdf_path = config.output_root / "certificates" / f"{payload['certificateNumber']}.pdf"
    write_pdf(pdf_path, payload, digest)
    return {"payload": payload, "contentHash": digest, "hashAlgorithm": "SHA-256", "signatureAlgorithm": "Ed25519", "signature": base64.b64encode(signature).decode("ascii"), "pdfPath": str(pdf_path) if pdf_path.exists() else None}
