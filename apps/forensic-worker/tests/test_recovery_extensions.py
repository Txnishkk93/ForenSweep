from __future__ import annotations

from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from PIL import Image

from forensweep_worker.recovery.validators import validate_png, validate_zip


def test_png_validation_reports_dimensions(tmp_path: Path) -> None:
    path = tmp_path / "image.png"
    image = Image.new("RGB", (3, 2), color="red")
    image.save(path)
    result = validate_png(path)
    assert result["valid"] is True
    assert result["width"] == 3
    assert result["height"] == 2


def test_zip_validator_identifies_docx_without_opening_content(tmp_path: Path) -> None:
    path = tmp_path / "document.docx"
    with ZipFile(path, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", "<document/>")
    result = validate_zip(path)
    assert result["valid"] is True
    assert result["isDocx"] is True
    assert result["macrosIgnored"] is True
