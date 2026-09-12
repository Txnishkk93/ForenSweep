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


def _method_label(method: str) -> str:
    labels = {
        "OVERWRITE_SINGLE": "Single-pass overwrite",
        "OVERWRITE_MULTI": "Multi-pass overwrite",
        "ATA_SECURE_ERASE": "ATA Secure Erase",
        "NVME_SECURE_FORMAT": "NVMe Secure Format",
        "CRYPTO_ERASE": "Cryptographic Erase",
        "FILE_LEVEL_OVERWRITE": "File-level overwrite",
    }
    return labels.get(method, method.replace("_", " "))


def _target_metadata(job: dict[str, Any], device: dict[str, Any]) -> tuple[str, list[str], str]:
    scope = str(job.get("eraseScope") or "WHOLE_DRIVE")
    raw_paths = job.get("eraseFileList") if scope == "SPECIFIC_FILES" else None
    paths = [str(item) for item in raw_paths or [] if isinstance(item, str)]
    if paths:
        if len(paths) == 1:
            display_name = Path(paths[0]).name or paths[0]
        else:
            display_name = "Selected files and folders"
        return display_name, paths, "Local filesystem"
    model = str(device.get("model") or "").strip()
    location = str(device.get("path") or job.get("sourceImagePath") or "").strip()
    return model or (Path(location).name if location else "Managed device image"), [location] if location else [], location


def _write_professional_pdf(
    path: Path,
    payload: dict[str, Any],
    digest: str,
    signature: str,
    previous_certificate_hash: str | None = None,
) -> None:
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_RIGHT
        from reportlab.lib.pagesizes import LETTER
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    ink = colors.HexColor("#17201d")
    muted = colors.HexColor("#68736e")
    success = colors.HexColor("#14805d")
    failure = colors.HexColor("#b4233f")
    hairline = colors.HexColor("#dce3df")
    soft = colors.HexColor("#f4f7f5")
    pass_background = colors.HexColor("#e5f4ee")
    fail_background = colors.HexColor("#fae8ed")
    amber_background = colors.HexColor("#fff6df")
    styles = getSampleStyleSheet()
    wordmark_style = ParagraphStyle("Wordmark", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=17, leading=20, textColor=ink)
    title_style = ParagraphStyle("Title", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=23, leading=27, textColor=ink, spaceAfter=4)
    subtitle_style = ParagraphStyle("Subtitle", parent=styles["Normal"], fontName="Helvetica", fontSize=9, leading=12, textColor=muted)
    section_style = ParagraphStyle("Section", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=ink, spaceBefore=6, spaceAfter=7)
    label_style = ParagraphStyle("Label", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=7.5, leading=9, textColor=muted, spaceAfter=3)
    target_style = ParagraphStyle("Target", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=ink)
    value_style = ParagraphStyle("Value", parent=styles["Normal"], fontName="Helvetica", fontSize=10, leading=14, textColor=ink)
    path_style = ParagraphStyle("Path", parent=styles["Normal"], fontName="Helvetica", fontSize=9, leading=12, textColor=ink, leftIndent=8)
    mono_style = ParagraphStyle("Mono", parent=styles["Normal"], fontName="Courier", fontSize=7.5, leading=9.5, textColor=ink, wordWrap="CJK")
    right_mono_style = ParagraphStyle("RightMono", parent=mono_style, alignment=TA_RIGHT)
    status_style = ParagraphStyle("Status", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=success, alignment=TA_LEFT)
    small_style = ParagraphStyle("Small", parent=styles["Normal"], fontName="Helvetica", fontSize=8, leading=10, textColor=muted)

    def paragraph(text: str, style: ParagraphStyle) -> Paragraph:
        return Paragraph(escape(str(text)).replace("\n", "<br/>"), style)

    verified = bool(payload.get("verificationResult"))
    status_color = pass_background if verified else fail_background
    status_text = "Verified - no recoverable data found" if verified else "Verification failed - review required"
    issued_at = str(payload.get("endedAt", "")).replace("T", " ").replace("Z", " UTC")
    device = payload.get("deviceSnapshot") or {}
    target_name = str(payload.get("targetDisplayName") or device.get("model") or "Certificate target")
    target_paths = [str(item) for item in payload.get("targetPaths") or []]
    title = "Certificate of Data Recovery" if payload.get("jobType") == "RECOVER" else "Certificate of Secure Erasure"
    method = _method_label(str(payload.get("method") or "UNKNOWN"))
    standard = str(payload.get("standard") or "NIST_800_88").replace("_", " ")
    location = str(device.get("path") or "")

    def footer(canvas: Any, document: Any) -> None:
        canvas.saveState()
        canvas.setStrokeColor(hairline)
        canvas.line(document.leftMargin, 0.55 * inch, LETTER[0] - document.rightMargin, 0.55 * inch)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(muted)
        canvas.drawString(document.leftMargin, 0.37 * inch, "Independently re-verifiable certificate")
        canvas.drawRightString(LETTER[0] - document.rightMargin, 0.37 * inch, f"Generated {issued_at}")
        canvas.restoreState()

    document = SimpleDocTemplate(str(path), pagesize=LETTER, rightMargin=0.72 * inch, leftMargin=0.72 * inch, topMargin=0.55 * inch, bottomMargin=0.82 * inch)
    story: list[Any] = []
    header = Table([[paragraph("ForenSweep", wordmark_style), paragraph(payload.get("certificateNumber", ""), right_mono_style)]], colWidths=[4.7 * inch, 2.0 * inch])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT"), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story.extend([header, HRFlowable(width="100%", thickness=0.7, color=hairline), Spacer(1, 18), paragraph(title, title_style), paragraph(f"Completed {issued_at}", subtitle_style), Spacer(1, 18)])

    target = Table([[paragraph("WHAT WAS PROCESSED", label_style)], [paragraph(target_name, target_style)], [paragraph((f"On {device.get('model')}" if device.get("model") else "") + (f" at {location}" if location else ""), subtitle_style)]], colWidths=[6.35 * inch])
    target.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), soft), ("BOX", (0, 0), (-1, -1), 0.6, hairline), ("LEFTPADDING", (0, 0), (-1, -1), 13), ("RIGHTPADDING", (0, 0), (-1, -1), 13), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
    story.extend([target, Spacer(1, 12)])
    if target_paths:
        story.append(paragraph("TARGET PATHS", label_style))
        story.extend(paragraph(f"- {item}", path_style) for item in target_paths)
        story.append(Spacer(1, 9))

    status = Table([[paragraph(status_text, status_style)]], colWidths=[6.35 * inch])
    status.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), status_color), ("BOX", (0, 0), (-1, -1), 0.5, status_color), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9), ("TEXTCOLOR", (0, 0), (-1, -1), success if verified else failure)]))
    story.extend([status, Spacer(1, 14), paragraph("Method and standard", section_style)])
    details = Table([[paragraph("METHOD", label_style), paragraph("STANDARD", label_style)], [paragraph(method, value_style), paragraph(standard, value_style)]], colWidths=[3.15 * inch, 3.2 * inch])
    details.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 16), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    story.extend([details, Spacer(1, 12), paragraph("For verification purposes", section_style)])
    previous = previous_certificate_hash or "GENESIS"
    crypto = Table([[paragraph("JOB ID", label_style), paragraph("CERTIFICATE ID", label_style)], [paragraph(payload.get("jobId", ""), mono_style), paragraph(payload.get("certificateNumber", ""), mono_style)], [paragraph("CONTENT HASH", label_style)], [paragraph(digest, mono_style)], [paragraph("SIGNATURE (ED25519)", label_style)], [paragraph(signature, mono_style)], [paragraph("PREVIOUS CERTIFICATE HASH", label_style)], [paragraph(previous, mono_style)]], colWidths=[3.15 * inch, 3.2 * inch])
    crypto.setStyle(TableStyle([("SPAN", (0, 2), (-1, 2)), ("SPAN", (0, 3), (-1, 3)), ("SPAN", (0, 4), (-1, 4)), ("SPAN", (0, 5), (-1, 5)), ("SPAN", (0, 6), (-1, 6)), ("SPAN", (0, 7), (-1, 7)), ("BACKGROUND", (0, 1), (-1, 1), soft), ("BACKGROUND", (0, 3), (-1, 3), soft), ("BACKGROUND", (0, 5), (-1, 5), soft), ("BACKGROUND", (0, 7), (-1, 7), soft), ("BOX", (0, 1), (-1, 1), 0.5, hairline), ("BOX", (0, 3), (-1, 3), 0.5, hairline), ("BOX", (0, 5), (-1, 5), 0.5, hairline), ("BOX", (0, 7), (-1, 7), 0.5, hairline), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story.extend([crypto, Spacer(1, 13), paragraph("Verification covers the test image and sampled regions, not an absolute physical-media claim.", small_style)])
    document.build(story, onFirstPage=footer, onLaterPages=footer)


def write_pdf(
    path: Path,
    payload: dict[str, Any],
    digest: str,
    signature: str,
    previous_certificate_hash: str | None = None,
) -> None:
    _write_professional_pdf(path, payload, digest, signature, previous_certificate_hash)
    return
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
    target_display_name, target_paths, _ = _target_metadata(job, device)
    ended_at = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "certificateNumber": f"FS-{ended_at.strftime('%Y%m%d%H%M%S')}-{job['id'][:8].upper()}",
        "jobId": job["id"],
        "jobType": job.get("type") or "ERASE",
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
        "targetDisplayName": target_display_name,
        "targetPaths": target_paths,
        "warnings": [],
        "limitations": ["Verification applies to the test image and sampled regions, not an absolute physical-media claim."],
    }
    digest = content_hash(payload)
    signature = load_private_key(config.cert_private_key_path).sign(digest.encode("utf-8"))
    pdf_path = config.output_root / "certificates" / f"{payload['certificateNumber']}.pdf"
    signature_text = base64.b64encode(signature).decode("ascii")
    write_pdf(pdf_path, payload, digest, signature_text)
    return {"payload": payload, "contentHash": digest, "hashAlgorithm": "SHA-256", "signatureAlgorithm": "Ed25519", "signature": signature_text, "pdfPath": str(pdf_path) if pdf_path.exists() else None}
