from __future__ import annotations

import hashlib
import os
from pathlib import Path

from ..models import VerificationResult


def verify_overwrite(path: Path, pattern: bytes, sample_count: int) -> VerificationResult:
    size = path.stat().st_size
    if size == 0:
        return VerificationResult(True, 0.0, "LOW", {"sampledBytes": 0, "note": "Empty test image."})
    block_size = min(len(pattern), 4096)
    offsets = sorted({(index * max(size - block_size, 0)) // max(sample_count - 1, 1) for index in range(sample_count)})
    mismatches = 0
    sampled_bytes = 0
    with path.open("rb") as handle:
        for offset in offsets:
            handle.seek(offset)
            block = handle.read(block_size)
            sampled_bytes += len(block)
            if block != (pattern * ((len(block) // len(pattern)) + 1))[: len(block)]:
                mismatches += 1
    score = mismatches / max(len(offsets), 1)
    return VerificationResult(
        verified=mismatches == 0,
        residual_risk_score=score,
        residual_risk_level="LOW" if score == 0 else "HIGH",
        details={
            "sampleCount": len(offsets),
            "sampledBytes": sampled_bytes,
            "mismatches": mismatches,
            "sampleOffsetsSha256": hashlib.sha256(",".join(map(str, offsets)).encode()).hexdigest(),
            "limitation": "Verification applies to this test image and sampled regions, not an absolute physical-media claim.",
        },
    )


def overwrite_pattern(pass_number: int) -> bytes:
    return bytes([0x00 if pass_number % 2 else 0xFF])
