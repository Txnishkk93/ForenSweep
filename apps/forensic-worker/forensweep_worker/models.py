from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class WorkerContext:
    job_id: str
    erase_method: str
    total_passes: int
    image_path: str | None
    device_size_bytes: int | None


@dataclass(frozen=True, slots=True)
class VerificationResult:
    verified: bool
    residual_risk_score: float
    residual_risk_level: str
    details: dict[str, Any]
