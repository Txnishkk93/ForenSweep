from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from .config import Config


class WorkerApiClient:
    def __init__(self, config: Config) -> None:
        self._config = config

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            f"{self._config.backend_internal_url}{path}",
            data=body,
            method=method,
            headers={"x-worker-token": self._config.internal_worker_token, "content-type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"worker API request failed: HTTP {error.code}") from error
        except urllib.error.URLError as error:
            raise RuntimeError("worker API is unreachable") from error

    def context(self, job_id: str) -> dict[str, Any]:
        return self._request("GET", f"/internal/jobs/{job_id}/worker-context")

    def progress(self, job_id: str, payload: dict[str, Any]) -> None:
        self._request("POST", f"/internal/jobs/{job_id}/progress", payload)

    def complete(self, job_id: str, payload: dict[str, Any]) -> None:
        self._request("POST", f"/internal/jobs/{job_id}/complete", payload)

    def fail(self, job_id: str, payload: dict[str, Any]) -> None:
        self._request("POST", f"/internal/jobs/{job_id}/fail", payload)

    def audit(self, job_id: str, payload: dict[str, Any]) -> None:
        self._request("POST", f"/internal/jobs/{job_id}/audit", payload)
