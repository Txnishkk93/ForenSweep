from __future__ import annotations

import os
from pathlib import Path
from typing import Callable

from .verification import overwrite_pattern

Progress = Callable[[int, int, int, int, str], None]


def simulate_overwrite(path: Path, chunk_size: int, total_passes: int, progress: Progress) -> None:
    total_passes = max(total_passes, 1)
    size = path.stat().st_size
    for pass_number in range(1, total_passes + 1):
        pattern = overwrite_pattern(pass_number)
        processed = 0
        with path.open("r+b") as handle:
            while processed < size:
                chunk = min(chunk_size, size - processed)
                handle.write(pattern * chunk)
                processed += chunk
                progress(pass_number, total_passes, processed, size, "OVERWRITING")
            handle.flush()
            os.fsync(handle.fileno())
