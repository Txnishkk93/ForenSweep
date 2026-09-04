from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Signature:
    kind: str
    header: bytes
    footer: bytes
    max_size: int
    extension: str


JPEG = Signature("JPEG", b"\xff\xd8\xff", b"\xff\xd9", 25 * 1024 * 1024, ".jpg")
PDF = Signature("PDF", b"%PDF-", b"%%EOF", 50 * 1024 * 1024, ".pdf")
SUPPORTED = (JPEG, PDF)
