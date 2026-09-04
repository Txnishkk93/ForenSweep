from __future__ import annotations

import argparse
from pathlib import Path

JPEG = bytes.fromhex("ffd8ffe000104a46494600010100000100010000ffd9")
PDF = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a synthetic JPEG/PDF recovery image")
    parser.add_argument("--root", type=Path, default=Path("../../storage/safe-images"))
    args = parser.parse_args()
    root = args.root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    target = root / "recovery-sample.img"
    target.write_bytes(b"ForenSweep synthetic sample\n" + JPEG + b"\n" + PDF)
    print(f"Created synthetic recovery sample at {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
