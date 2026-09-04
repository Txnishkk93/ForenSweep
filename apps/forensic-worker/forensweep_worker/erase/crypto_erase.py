from __future__ import annotations

from pathlib import Path


class CryptoErase:
    def execute(self, image_path: Path) -> None:
        raise RuntimeError("Crypto erase is disabled because REAL_DEVICE_OPERATIONS=false")
