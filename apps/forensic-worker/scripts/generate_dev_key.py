from __future__ import annotations

import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


root = Path(os.environ.get("CERT_PRIVATE_KEY_PATH", "./secrets/forensweep-ed25519-private.pem")).expanduser()
public = Path(os.environ.get("CERT_PUBLIC_KEY_PATH", "../../apps/backend/secrets/forensweep-ed25519-public.pem")).expanduser()
root.parent.mkdir(parents=True, exist_ok=True)
public.parent.mkdir(parents=True, exist_ok=True)
key = Ed25519PrivateKey.generate()
root.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
public.write_bytes(key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
print(f"Generated development keypair: {root} and {public}")
