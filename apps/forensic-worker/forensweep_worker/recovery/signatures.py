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
PNG = Signature("PNG", b"\x89PNG\r\n\x1a\n", b"IEND\xaeB`\x82", 25 * 1024 * 1024, ".png")
ZIP = Signature("ZIP", b"PK\x03\x04", b"PK\x05\x06", 50 * 1024 * 1024, ".zip")
SUPPORTED = (JPEG, PDF, PNG, ZIP)
