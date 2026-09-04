# @repo/forensic-contracts

This package contains the JSON-facing contract boundary for the future forensic worker.

Node services validate incoming and outgoing data with Zod from `@repo/shared`.
The future Python worker validates the same payloads with Pydantic.

All values that originate as database or filesystem `BigInt` values must be serialized as strings before crossing this boundary.

Python owns the future low-level forensic and disk-image processing worker. Node services must not execute raw-device commands directly.
