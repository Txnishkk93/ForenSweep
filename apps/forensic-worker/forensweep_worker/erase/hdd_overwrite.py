from __future__ import annotations

from pathlib import Path

from .base import EraseStrategy
from .simulated import simulate_overwrite


class HddOverwrite(EraseStrategy):
    def execute(self, image_path: Path) -> None:
        simulate_overwrite(image_path, 1024 * 1024, 3, lambda *_args: None)
