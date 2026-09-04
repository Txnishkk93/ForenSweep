from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class Chunk:
    offset: int
    data: bytes


def read_chunks(path: Path, chunk_size: int, overlap: int = 16) -> Iterator[Chunk]:
    if chunk_size <= 0 or overlap < 0:
        raise ValueError("chunk_size must be positive and overlap cannot be negative")
    with path.open("rb") as handle:
        offset = 0
        carry = b""
        while True:
            block = handle.read(chunk_size)
            if not block:
                break
            combined = carry + block
            yield Chunk(offset=max(offset - len(carry), 0), data=combined)
            offset += len(block)
            carry = combined[-overlap:]
