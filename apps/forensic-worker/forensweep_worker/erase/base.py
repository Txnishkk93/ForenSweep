from __future__ import annotations

from pathlib import Path
from typing import Protocol


class EraseStrategy(Protocol):
    def execute(self, image_path: Path) -> None:
        ...
