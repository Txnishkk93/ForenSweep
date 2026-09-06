from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from forensweep_worker.jobs.recover_job import run_recovery
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


def test_deep_recovery_dispatches_with_recorded_scan_type(tmp_path: Path) -> None:
    source = tmp_path / "source.img"
    source.write_bytes(b"empty")
    config = SimpleNamespace(
        safe_image_root=tmp_path,
        output_root=tmp_path,
        max_image_size=1024,
        chunk_size=1024,
        max_candidates=10,
        max_duration_seconds=5,
        max_extraction_size=1024,
    )
    calls: list[tuple[Path, str]] = []

    class FakeClient:
        def context(self, _job_id: str) -> dict[str, object]:
            return {"data": {"job": {"scanType": "DEEP", "sourceImagePath": str(source)}}}

        def audit(self, *_args: object) -> None: pass
        def progress(self, *_args: object) -> None: pass
        def recovered_file(self, *_args: object) -> None: pass
        def complete(self, *_args: object) -> None: pass

    def fake_scan(path: Path, _output_dir: Path, *_args: object, **kwargs: object) -> list[dict[str, object]]:
        calls.append((path, str(kwargs["scan_type"])))
        return []

    with patch("forensweep_worker.jobs.recover_job.scan_and_carve", fake_scan):
        run_recovery("9f3b0059-841c-4210-92c3-fc2c6d648c4e", config, FakeClient())
    assert calls == [(source.resolve(), "DEEP")]