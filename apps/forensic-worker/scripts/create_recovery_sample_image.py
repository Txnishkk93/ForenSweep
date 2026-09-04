from __future__ import annotations

import argparse
from io import BytesIO
from pathlib import Path

from PIL import Image
from reportlab.pdfgen.canvas import Canvas


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a synthetic JPEG/PDF recovery image")
    parser.add_argument("--root", type=Path, default=Path("../../storage/safe-images"))
    args = parser.parse_args()
    root = args.root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    image_buffer = BytesIO()
    Image.new("RGB", (320, 200), "steelblue").save(image_buffer, format="JPEG", quality=90)
    pdf_buffer = BytesIO()
    canvas = Canvas(pdf_buffer)
    canvas.drawString(72, 720, "ForenSweep synthetic recovery sample")
    canvas.save()
    target = root / "demo-safe-image.img"
    target.write_bytes(b"ForenSweep synthetic sample\n" + image_buffer.getvalue() + b"\n" + pdf_buffer.getvalue())
    print(f"Created synthetic recovery sample at {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
