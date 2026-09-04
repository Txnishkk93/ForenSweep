from __future__ import annotations

from typing import Any


def score_confidence(*, signature: bool, footer: bool, structure: bool, parser_decode: bool, truncated: bool, fragmented: bool) -> dict[str, Any]:
    components = {
        "signature": 0.2 if signature else 0.0,
        "footer": 0.2 if footer else 0.0,
        "structure": 0.2 if structure else 0.0,
        "parserDecode": 0.4 if parser_decode else 0.0,
        "truncationPenalty": -0.2 if truncated else 0.0,
        "fragmentationPenalty": -0.1 if fragmented else 0.0,
    }
    score = max(0.0, min(1.0, sum(components.values())))
    level = "HIGH" if score >= 0.8 else "MEDIUM" if score >= 0.5 else "LOW"
    reasons = [
        "Recognized file signature." if signature else "File signature was not recognized.",
        "Footer marker was found." if footer else "Footer marker was not found; candidate may be truncated.",
        "Basic structure checks passed." if structure else "Basic structure checks failed.",
        "Parser or decoder validation passed." if parser_decode else "Parser or decoder validation did not pass.",
    ]
    if truncated: reasons.append("Candidate was truncated by the extraction limit.")
    if fragmented: reasons.append("Fragment reconstruction is not implemented.")
    return {"score": score, "level": level, "components": components, "reasons": reasons}
