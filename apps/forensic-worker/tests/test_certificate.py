from __future__ import annotations

import base64
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from forensweep_worker.certificate import canonical_json, content_hash


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
