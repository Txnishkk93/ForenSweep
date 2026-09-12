from __future__ import annotations

import os
from pathlib import Path
from typing import Callable

from .verification import overwrite_pattern

Progress = Callable[[int, int], None]


def is_protected_path(path: Path) -> bool:
    resolved = path.resolve(strict=False)
    if os.name == "nt":
        normalized = str(resolved).replace("/", "\\").lower()
        system_drive = os.environ.get("SystemDrive", "C:").replace("/", "\\").lower()
        return (
            normalized == system_drive
            or normalized.startswith(f"{system_drive}\\windows")
            or normalized.startswith(f"{system_drive}\\program files")
            or normalized.startswith(f"{system_drive}\\programdata")
            or normalized.startswith(f"{system_drive}\\users\\public")
        )
    normalized = str(resolved)
    return normalized == "/" or any(
        normalized == prefix or normalized.startswith(f"{prefix}/")
        for prefix in ("/System", "/usr", "/etc", "/bin", "/sbin", "/var")
    )


def expand_targets(raw_targets: list[str]) -> list[Path]:
    expanded: list[Path] = []
    seen: set[Path] = set()
    for raw_target in raw_targets:
        target = Path(raw_target)
        if not target.is_absolute():
            raise ValueError(f"Target is not absolute: {raw_target}")
        resolved = target.resolve(strict=True)
        if is_protected_path(resolved):
            raise ValueError(f"Protected system path: {resolved}")
        if resolved.is_symlink():
            raise ValueError(f"Symlink targets are not allowed: {resolved}")
        if resolved.is_dir():
            for root, directories, files in os.walk(resolved, topdown=True, followlinks=False):
                directories[:] = [name for name in directories if not (Path(root) / name).is_symlink()]
                for name in files:
                    path = (Path(root) / name).resolve(strict=True)
                    if path not in seen:
                        seen.add(path)
                        expanded.append(path)
        elif resolved.is_file() and resolved not in seen:
            seen.add(resolved)
            expanded.append(resolved)
        else:
            raise ValueError(f"Target is not a regular file or directory: {resolved}")
    return expanded


def secure_overwrite_file(path: Path, passes: int, chunk_size: int, progress: Progress) -> None:
    if path.is_symlink() or not path.is_file():
        raise OSError(f"Target is not a regular file: {path}")
    size = path.stat().st_size
    with path.open("r+b", buffering=0) as handle:
        for pass_number in range(1, passes + 1):
            handle.seek(0)
            pattern = overwrite_pattern(pass_number)
            remaining = size
            while remaining:
                chunk = pattern * min(chunk_size // len(pattern), remaining // len(pattern))
                if not chunk:
                    chunk = pattern[:remaining]
                handle.write(chunk)
                remaining -= len(chunk)
            handle.flush()
            os.fsync(handle.fileno())
            progress(pass_number, passes)
    path.unlink()


def remove_empty_directories(raw_targets: list[str]) -> None:
    for raw_target in raw_targets:
        path = Path(raw_target).resolve(strict=False)
        if not path.is_dir() or path.is_symlink() or is_protected_path(path):
            continue
        for root, directories, _files in os.walk(path, topdown=False, followlinks=False):
            for directory in directories:
                candidate = Path(root) / directory
                if not candidate.is_symlink() and not is_protected_path(candidate):
                    try:
                        candidate.rmdir()
                    except OSError:
                        pass
        try:
            path.rmdir()
        except OSError:
            pass
