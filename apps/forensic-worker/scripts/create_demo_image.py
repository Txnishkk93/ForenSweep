from __future__ import annotations

import argparse
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a small safe ForenSweep demo image")
    parser.add_argument("--root", type=Path, default=Path("../../storage/safe-images"))
    parser.add_argument("--name", default="demo-hdd.img")
    parser.add_argument("--size-mb", type=int, default=1)
    args = parser.parse_args()
    if args.size_mb < 1 or args.size_mb > 100:
        raise ValueError("size-mb must be between 1 and 100")
    root = args.root.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    target = (root / args.name).resolve()
    if target.parent != root or target.suffix.lower() != ".img":
        raise ValueError("demo image must be an .img directly under the safe root")
    with target.open("wb") as handle:
        handle.truncate(args.size_mb * 1024 * 1024)
    print(f"Created {target} ({args.size_mb} MiB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())