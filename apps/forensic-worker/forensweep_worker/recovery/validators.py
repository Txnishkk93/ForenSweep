from __future__ import annotations

from pathlib import Path
from typing import Any
from zipfile import BadZipFile, ZipFile


def validate_jpeg(path: Path) -> dict[str, Any]:
    try:
        from PIL import Image
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            return {"valid": True, "parser": "Pillow", "width": image.width, "height": image.height}
    except Exception as error:
        return {"valid": False, "parser": "Pillow", "error": str(error)}


def validate_pdf(path: Path) -> dict[str, Any]:
    data = path.read_bytes() if path.stat().st_size <= 50 * 1024 * 1024 else b""
    result: dict[str, Any] = {"valid": data.startswith(b"%PDF-") and b"%%EOF" in data, "header": data.startswith(b"%PDF-"), "footer": b"%%EOF" in data}
    try:
        from pypdf import PdfReader
        result["pages"] = len(PdfReader(str(path), strict=False).pages)
        result["parser"] = "pypdf"
        result["valid"] = bool(result["valid"])
    except Exception as error:
        result["parserError"] = str(error)
    return result


def validate_png(path: Path) -> dict[str, Any]:
    try:
        from PIL import Image
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            return {"valid": True, "parser": "Pillow", "width": image.width, "height": image.height}
    except Exception as error:
        return {"valid": False, "parser": "Pillow", "error": str(error)}


def validate_zip(path: Path) -> dict[str, Any]:
    try:
        with ZipFile(path) as archive:
            names = archive.namelist()
            is_docx = "word/document.xml" in names
            return {"valid": archive.testzip() is None, "parser": "zipfile", "entryCount": len(names), "isDocx": is_docx, "macrosIgnored": True}
    except (BadZipFile, OSError) as error:
        return {"valid": False, "parser": "zipfile", "error": str(error), "isDocx": False}
