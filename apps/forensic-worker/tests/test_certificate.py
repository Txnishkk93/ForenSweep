from __future__ import annotations

import base64
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from pypdf import PdfReader

from forensweep_worker.certificate import canonical_json, content_hash, write_pdf


def test_canonical_hash_is_stable_and_edits_fail_signature() -> None:
    payload = {"jobId": "job-1", "device": {"size": "1000", "type": "HDD"}, "verified": True}
    reordered = {"verified": True, "device": {"type": "HDD", "size": "1000"}, "jobId": "job-1"}
    assert canonical_json(payload) == canonical_json(reordered)
    digest = content_hash(payload)
    key = Ed25519PrivateKey.generate()
    signature = key.sign(digest.encode("utf-8"))
    assert key.public_key().verify(signature, digest.encode("utf-8")) is None
    edited_digest = content_hash({**payload, "verified": False})
    assert edited_digest != digest
    try:
        key.public_key().verify(signature, edited_digest.encode("utf-8"))
    except Exception:
        pass
    else:
        raise AssertionError("edited payload must fail signature verification")
    assert base64.b64encode(signature)
    assert Path(".").exists()


def test_certificate_pdf_renders_both_statuses_and_long_crypto_values(tmp_path: Path) -> None:
    disclaimer = "verification covers the test image and sampled regions, not an absolute physical-media claim"
    for verified, status in ((True, "VERIFICATION PASSED"), (False, "VERIFICATION FAILED")):
        payload = {
            "certificateNumber": f"FS-20260906112156-{'PASS' if verified else 'FAIL'}",
            "jobId": "f101d553-0098-4133-bdde-aaefaf46ddaf",
            "deviceSnapshot": {"model": "ForenSweep Safe Demo Image"},
            "method": "OVERWRITE_MULTI",
            "standard": "NIST_800_88",
            "endedAt": "2026-09-06T11:21:56.893755Z",
            "verificationResult": verified,
        }
        path = tmp_path / f"{verified}.pdf"
        write_pdf(path, payload, "a" * 64, "b" * 88)

        text = "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)
        assert status in text
        assert "a" * 64 in text
        assert "b" * 88 in text
        assert disclaimer in text
        assert "GENESIS" in text
