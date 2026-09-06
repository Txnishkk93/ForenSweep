from __future__ import annotations

import os
from pathlib import Path
from typing import Callable

Progress = Callable[[int, int], None]


def overwrite_usb_device(
    path: Path,
    capacity: int,
    chunk_size: int,
    progress: Progress,
    cancelled: Callable[[], bool],
) -> int:
    """Single-pass zero overwrite for a pre-validated removable USB target."""
    processed = 0
    block = b"\x00" * chunk_size
    with path.open("r+b", buffering=0) as handle:
        while processed < capacity:
            if cancelled():
                break
            count = min(len(block), capacity - processed)
            written = handle.write(block[:count])
            if written != count:
                raise OSError(f"short write at byte offset {processed}")
            processed += written
            progress(processed, capacity)
        handle.flush()
        os.fsync(handle.fileno())
    return processed