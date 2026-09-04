from __future__ import annotations

from pathlib import Path


class NvmeSanitize:
    def execute(self, image_path: Path) -> None:
        raise RuntimeError("NVMe sanitize is disabled because REAL_DEVICE_OPERATIONS=false")
