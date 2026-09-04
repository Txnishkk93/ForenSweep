from __future__ import annotations

import hashlib
import re
import time
from pathlib import Path
from typing import Any

from .confidence import score_confidence
from .signatures import SUPPORTED, Signature
from .stream_reader import read_chunks
from .validators import validate_jpeg, validate_pdf

_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_name(kind: str, offset: int, extension: str) -> str:
    return _FILENAME.sub("_", f"recovered_{kind.lower()}_{offset}{extension}")


def scan_and_carve(source: Path, output_dir: Path, *, chunk_size: int, max_candidates: int, max_duration_seconds: int, max_extraction_size: int) -> list[dict[str, Any]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    started = time.monotonic()
    for chunk in read_chunks(source, chunk_size, overlap=64):
        if time.monotonic() - started > max_duration_seconds or len(candidates) >= max_candidates:
            break
        for signature in SUPPORTED:
            cursor = 0
            while len(candidates) < max_candidates:
                found = chunk.data.find(signature.header, cursor)
                if found < 0: break
                absolute = chunk.offset + found
                key = (signature.kind, absolute)
                cursor = found + 1
                if key in seen: continue
                seen.add(key)
                candidate = _extract(source, signature, absolute, output_dir, max_duration_seconds - (time.monotonic() - started), min(signature.max_size, max_extraction_size))
                if candidate is not None: candidates.append(candidate)
    return candidates


def _extract(source: Path, signature: Signature, offset: int, output_dir: Path, remaining_seconds: float, max_size: int) -> dict[str, Any] | None:
    if remaining_seconds <= 0: return None
    deadline = time.monotonic() + remaining_seconds
    source_size = source.stat().st_size
    max_end = min(source_size, offset + max_size)
    data = bytearray()
    footer_found = False
    with source.open("rb") as handle:
        handle.seek(offset)
        while handle.tell() < max_end and time.monotonic() < deadline:
            block = handle.read(min(1024 * 1024, max_end - handle.tell()))
            if not block: break
            data.extend(block)
            footer_index = data.find(signature.footer)
            if footer_index >= 0:
                data = data[: footer_index + len(signature.footer)]
                footer_found = True
                break
    truncated = not footer_found
    if not data: return None
    path = output_dir / _safe_name(signature.kind, offset, signature.extension)
    path.write_bytes(data)
    validation = validate_jpeg(path) if signature.kind == "JPEG" else validate_pdf(path)
    structure = bool(validation.get("valid"))
    scoring = score_confidence(signature=True, footer=footer_found, structure=structure, parser_decode=bool(validation.get("valid")), truncated=truncated, fragmented=False)
    return {
        "fileName": path.name,
        "fileType": signature.kind,
        "mimeType": "image/jpeg" if signature.kind == "JPEG" else "application/pdf",
        "offsetStart": str(offset),
        "offsetEnd": str(offset + len(data)),
        "isFragmented": False,
        "isTruncated": truncated,
        "fragmentCount": 1,
        "confidenceScore": scoring["score"],
        "confidenceLevel": scoring["level"],
        "scoreBreakdown": scoring["components"],
        "validationNotes": {"validation": validation, "reasons": scoring["reasons"]},
        "sha256": hashlib.sha256(data).hexdigest(),
        "storedPath": str(path),
    }
