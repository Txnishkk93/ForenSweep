from __future__ import annotations

from typing import Any


def reconstruct_jpeg_bifragment(*_args: Any, **_kwargs: Any) -> dict[str, str]:
    """Reserved extension point; bifragment reconstruction is intentionally disabled."""
    return {"status": "NOT_ATTEMPTED", "reason": "Fragment reconstruction is not implemented."}