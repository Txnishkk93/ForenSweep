from __future__ import annotations

import base64
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

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


def write_pdf(
    path: Path,
    payload: dict[str, Any],
    digest: str,
    signature: str,
    previous_certificate_hash: str | None = None,
) -> None:
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT
        from reportlab.lib.pagesizes import LETTER
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import (
            HRFlowable,
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    ink = colors.HexColor("#1c1f1e")
    muted = colors.HexColor("#7a7d78")
    success = colors.HexColor("#1f8a65")
    destructive = colors.HexColor("#cf2d56")
    hairline = colors.HexColor("#e2e4e1")
    pass_background = colors.HexColor("#e6f4ee")
    fail_background = colors.HexColor("#fbe8ed")
    amber_background = colors.HexColor("#fff6df")
    styles = getSampleStyleSheet()
    label_style = ParagraphStyle(
        "Label", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8,
        leading=10, textColor=muted, spaceAfter=3,
    )
    value_style = ParagraphStyle(
        "Value", parent=styles["Normal"], fontName="Helvetica", fontSize=10,
        leading=13, textColor=ink,
    )
    mono_style = ParagraphStyle(
        "Mono", parent=styles["Normal"], fontName="Courier", fontSize=8.2,
        leading=10.5, textColor=ink, wordWrap="CJK",
    )
    status_pass_style = ParagraphStyle(
        "StatusPass", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=12,
        leading=15, textColor=success, alignment=TA_CENTER,
    )
    status_fail_style = ParagraphStyle(
        "StatusFail", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=12,
        leading=15, textColor=destructive, alignment=TA_CENTER,
    )
    wordmark_style = ParagraphStyle(
        "Wordmark", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=18,
        leading=21, textColor=ink,
    )
    title_style = ParagraphStyle(
        "Title", parent=styles["Normal"], fontName="Helvetica", fontSize=10,
        leading=13, textColor=muted,
    )
    right_mono_style = ParagraphStyle(
        "RightMono", parent=mono_style, alignment=TA_RIGHT,
    )
    section_style = ParagraphStyle(
        "Section", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=11,
        leading=14, textColor=ink, spaceBefore=4, spaceAfter=7,
    )
    small_style = ParagraphStyle(
        "Small", parent=styles["Normal"], fontName="Helvetica", fontSize=8,
        leading=10, textColor=muted,
    )

    def paragraph(text: str, style: ParagraphStyle) -> Paragraph:
        return Paragraph(escape(text).replace("\n", "<br/>").replace("  ", "&nbsp; "), style)

    verified = bool(payload["verificationResult"])
    status_style = status_pass_style if verified else status_fail_style
    status_color = pass_background if verified else fail_background
    status_text = "&#10003; VERIFICATION PASSED" if verified else "&#10007; VERIFICATION FAILED"
    issued_at = str(payload["endedAt"]).replace("T", " ").replace("Z", " UTC")
    device = payload.get("deviceSnapshot") or {}

    def footer(canvas: Any, document: Any) -> None:
        canvas.saveState()
        canvas.setStrokeColor(hairline)
        canvas.line(document.leftMargin, 0.55 * inch, LETTER[0] - document.rightMargin, 0.55 * inch)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(muted)
        canvas.drawString(document.leftMargin, 0.37 * inch, "Independently re-verifiable certificate")
        canvas.drawRightString(LETTER[0] - document.rightMargin, 0.37 * inch, f"Generated {issued_at}")
        canvas.restoreState()

    document = SimpleDocTemplate(
        str(path), pagesize=LETTER, rightMargin=0.65 * inch, leftMargin=0.65 * inch,
        topMargin=0.55 * inch, bottomMargin=0.8 * inch,
    )
    story: list[Any] = []
    header = Table(
        [[paragraph("ForenSweep", wordmark_style), paragraph("Secure Erasure Certificate", title_style), paragraph(payload["certificateNumber"], right_mono_style)]],
        colWidths=[2.2 * inch, 2.45 * inch, 2.0 * inch],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (2, 0), (2, 0), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([header, HRFlowable(width="100%", thickness=0.7, color=hairline), Spacer(1, 14)])

    status = Table([[Paragraph(status_text, status_style)]], colWidths=[6.65 * inch], rowHeights=[0.42 * inch])
    status.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), status_color),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, status_color),
    ]))
    story.extend([status, Spacer(1, 16), paragraph("Certificate Summary", section_style)])

    summary = Table([
        [paragraph("DEVICE", label_style), paragraph("JOB ID", label_style)],
        [paragraph(str(device.get("model") or device.get("serial") or "Unknown"), value_style), paragraph(payload["jobId"], mono_style)],
        [paragraph("METHOD", label_style), paragraph("DATE ISSUED", label_style)],
        [paragraph(payload["method"], value_style), paragraph(issued_at, value_style)],
        [paragraph("STANDARD", label_style), paragraph("CERTIFICATE NUMBER", label_style)],
        [paragraph(payload["standard"], value_style), paragraph(payload["certificateNumber"], mono_style)],
    ], colWidths=[3.25 * inch, 3.4 * inch])
    summary.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.extend([summary, Spacer(1, 14), paragraph("Cryptographic Details", section_style)])

    previous = previous_certificate_hash or "GENESIS"
    if previous == "GENESIS":
        previous_flowable = Table([[paragraph("GENESIS", mono_style)]], colWidths=[0.7 * inch])
        previous_flowable.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.6, muted),
            ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
    else:
        previous_flowable = paragraph(previous, mono_style)
    crypto = Table([
        [paragraph("CONTENT HASH", label_style)], [paragraph(digest, mono_style)],
        [paragraph("SIGNATURE (ED25519)", label_style)], [paragraph(signature, mono_style)],
        [paragraph("PREVIOUS CERTIFICATE HASH", label_style)], [previous_flowable],
    ], colWidths=[6.65 * inch])
    crypto.setStyle(TableStyle([
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#f7f8f7")),
        ("BACKGROUND", (0, 3), (-1, 3), colors.HexColor("#f7f8f7")),
        ("BACKGROUND", (0, 5), (-1, 5), colors.HexColor("#f7f8f7")),
        ("BOX", (0, 1), (-1, 1), 0.5, hairline), ("BOX", (0, 3), (-1, 3), 0.5, hairline),
        ("BOX", (0, 5), (-1, 5), 0.5, hairline),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.extend([crypto, Spacer(1, 14)])

    disclaimer = Table([[paragraph(
        "verification covers the test image and sampled regions, not an absolute physical-media claim",
        value_style,
    )]], colWidths=[6.65 * inch])
    disclaimer.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), amber_background),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#d8bd72")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([paragraph("Scope and Limitation", section_style), disclaimer])
    document.build(story, onFirstPage=footer, onLaterPages=footer)


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
    signature_text = base64.b64encode(signature).decode("ascii")
    write_pdf(pdf_path, payload, digest, signature_text)
    return {"payload": payload, "contentHash": digest, "hashAlgorithm": "SHA-256", "signatureAlgorithm": "Ed25519", "signature": signature_text, "pdfPath": str(pdf_path) if pdf_path.exists() else None}
