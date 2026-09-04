from __future__ import annotations

from pathlib import Path


class AtaSecureErase:
    def execute(self, image_path: Path) -> None:
        raise RuntimeError("ATA secure erase is disabled because REAL_DEVICE_OPERATIONS=false")
