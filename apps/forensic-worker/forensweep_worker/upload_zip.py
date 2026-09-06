from __future__ import annotations

import os
import sys
import zipfile
from pathlib import Path


def safe_member_path(root: Path, name: str) -> Path:
    candidate = (root / name).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError("ZIP contains a path traversal entry")
    return candidate


def extract_and_concatenate(source: Path, output: Path, extraction_root: Path) -> None:
    maximum = int(os.environ.get("MAX_UPLOAD_BYTES", str(500 * 1024 * 1024)))
    extraction_root.mkdir(parents=True, exist_ok=False)
    total = 0
    with zipfile.ZipFile(source) as archive, output.open("wb") as image:
        if archive.testzip() is not None:
            raise ValueError("ZIP contains a corrupt entry")
        for member in archive.infolist():
            target = safe_member_path(extraction_root, member.filename)
            if member.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            if member.external_attr >> 16 & 0o170000 == 0o120000:
                raise ValueError("ZIP contains a symbolic link")
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source_file, target.open("wb") as extracted:
                while chunk := source_file.read(1024 * 1024):
                    total += len(chunk)
                    if total > maximum:
                        raise ValueError("ZIP expands beyond the upload size limit")
                    extracted.write(chunk)
                    image.write(chunk)


if __name__ == "__main__":
    try:
        extract_and_concatenate(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
    except (IndexError, OSError, ValueError, zipfile.BadZipFile) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)