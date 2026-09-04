from __future__ import annotations

from pathlib import Path


class FileErase:
    def execute(self, image_path: Path) -> None:
        raise RuntimeError("File-level erase is disabled because REAL_DEVICE_OPERATIONS=false")
