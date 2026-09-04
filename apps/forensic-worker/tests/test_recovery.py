from __future__ import annotations

from pathlib import Path

from forensweep_worker.recovery.carver import scan_and_carve
from forensweep_worker.recovery.confidence import score_confidence


def test_scanner_finds_header_split_across_chunks(tmp_path: Path) -> None:
    source = tmp_path / "source.img"
    output = tmp_path / "out"
    source.write_bytes(b"prefix\xff\xd8" + b"\xff" + b"payload\xff\xd9suffix")
    results = scan_and_carve(source, output, chunk_size=4, max_candidates=10, max_duration_seconds=5, max_extraction_size=1024)
    assert any(result["fileType"] == "JPEG" and result["offsetStart"] == "6" for result in results)


def test_confidence_classification_is_explainable() -> None:
    result = score_confidence(signature=True, footer=True, structure=True, parser_decode=True, truncated=False, fragmented=False)
    assert result["level"] == "HIGH"
    assert result["components"]["parserDecode"] == 0.4
    assert result["reasons"]