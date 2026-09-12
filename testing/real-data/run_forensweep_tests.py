"""Execute real-data ForenSweep scenarios in dependency-safe phases."""
from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import shutil
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from .device_guard import require_device_gate
except ImportError:
    from device_guard import require_device_gate

SCRIPT_DIR = Path(__file__).resolve().parent
RESULTS_DIR = SCRIPT_DIR.parent / "results"
MANIFEST_PATH = RESULTS_DIR / "seed_manifest.csv"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def logger() -> logging.Logger:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    log = logging.getLogger("forensweep.harness")
    log.setLevel(logging.INFO)
    if not log.handlers:
        handler = logging.FileHandler(RESULTS_DIR / "run.log", encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        log.addHandler(handler)
    return log


def api_request(base_url: str, path: str, token: str | None, payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload).encode()
    request = urllib.request.Request(
        base_url.rstrip("/") + path,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode())


def api_get(base_url: str, path: str, token: str | None) -> dict[str, Any]:
    request = urllib.request.Request(
        base_url.rstrip("/") + path,
        headers={"Authorization": f"Bearer {token}"} if token else {},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode())


def wait_for_job(base_url: str, job_id: str, token: str | None, timeout_seconds: int = 900) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        payload = api_get(base_url, f"/api/jobs/{job_id}", token)
        job = payload.get("data", payload)
        if job.get("status") in {"COMPLETED", "FAILED", "CANCELLED"}:
            if job["status"] != "COMPLETED":
                raise RuntimeError(f"job {job_id} ended with status {job['status']}: {job.get('errorMessage', '')}")
            return job
        time.sleep(2)
    raise TimeoutError(f"job {job_id} did not complete within {timeout_seconds} seconds")


def snapshot_manifest(scenario_id: str) -> Path:
    if not MANIFEST_PATH.exists():
        raise RuntimeError(f"Missing seed manifest: {MANIFEST_PATH}")
    destination = RESULTS_DIR / f"manifest_snapshot_{scenario_id}.csv"
    shutil.copy2(MANIFEST_PATH, destination)
    return destination


def create_recovery_manifest(
    scenario: dict[str, Any], snapshot: Path, recovered_files: list[dict[str, Any]]
) -> Path:
    """Record the exact pre-erase snapshot used for later ground-truth comparison."""
    destination = RESULTS_DIR / f"recovery_manifest_{scenario['id']}.csv"
    source_rows = list(csv.DictReader(snapshot.open(encoding="utf-8")))
    with destination.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["recovered_path", "recovered_sha256", "expected_path", "expected_sha256", "match", "evaluated_against"],
        )
        writer.writeheader()
        expected = {row["path"]: row for row in source_rows}
        for recovered in recovered_files:
            recovered_path = str(recovered.get("fileName") or recovered.get("storedPath") or "")
            recovered_hash = str(recovered.get("sha256") or recovered.get("contentHash") or "")
            expected_row = expected.get(recovered_path)
            writer.writerow({
                "recovered_path": recovered_path,
                "recovered_sha256": recovered_hash,
                "expected_path": expected_row["path"] if expected_row else "",
                "expected_sha256": expected_row["sha256"] if expected_row else "",
                "match": bool(expected_row and recovered_hash and recovered_hash == expected_row["sha256"]),
                "evaluated_against": snapshot.name,
            })
    return destination


def run_erase(scenario: dict[str, Any], args: argparse.Namespace, log: logging.Logger) -> None:
    snapshot = snapshot_manifest(scenario["id"])
    log.info("manifest_snapshot scenario=%s path=%s", scenario["id"], snapshot)
    payload = {
        "deviceId": scenario.get("device_id") or args.device_id,
        "eraseScope": scenario.get("erase_scope", "WHOLE_DRIVE"),
        "standard": scenario.get("standard", "NIST_800_88"),
        "typeToConfirm": args.expected_serial,
    }
    if scenario.get("paths"):
        payload["eraseFileList"] = scenario["paths"]
    response = api_request(args.backend_url, "/api/jobs/erase", args.token, payload)
    job = response.get("data", response)
    completed = wait_for_job(args.backend_url, job["id"], args.token)
    log.info("erase_completed scenario=%s job_id=%s response=%s", scenario["id"], job["id"], json.dumps(completed))


def run_recovery(scenario: dict[str, Any], args: argparse.Namespace, log: logging.Logger, snapshots: dict[str, Path]) -> None:
    dependency = scenario.get("after_erase_id")
    snapshot = snapshots.get(dependency) if dependency else MANIFEST_PATH
    if snapshot is None:
        raise RuntimeError(f"Missing manifest snapshot for dependency {dependency}")
    payload = {"deviceId": scenario.get("device_id") or args.device_id, "scanType": scenario.get("scan_type", "DEEP")}
    response = api_request(args.backend_url, "/api/jobs/recover", args.token, payload)
    job = response.get("data", response)
    wait_for_job(args.backend_url, job["id"], args.token)
    recovered_payload = api_get(args.backend_url, f"/api/jobs/{job['id']}/recovered-files", args.token)
    recovered_files = recovered_payload.get("data", recovered_payload)
    recovery_manifest = create_recovery_manifest(scenario, snapshot, recovered_files)
    log.info("recovery_completed scenario=%s job_id=%s evaluated_against=%s", scenario["id"], job["id"], recovery_manifest.name)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--volume", required=True)
    parser.add_argument("--i-am-sure", dest="expected_serial")
    parser.add_argument("--device-id", default=os.getenv("FORENSWEEP_DEVICE_ID", ""))
    parser.add_argument("--backend-url", default=os.getenv("FORENSWEEP_BACKEND_URL", "http://localhost:4000"))
    parser.add_argument("--token", default=os.getenv("FORENSWEEP_TOKEN"))
    parser.add_argument("--scenarios", type=Path, default=SCRIPT_DIR / "scenarios.json")
    args = parser.parse_args()
    log = logger()
    # CRITICAL: every erase/recovery phase resolves and authorizes the physical device before API triggers.
    device = require_device_gate(args.volume, args.expected_serial, RESULTS_DIR)
    args.expected_serial = device.serial
    scenarios = json.loads(args.scenarios.read_text(encoding="utf-8"))
    erase = [scenario for scenario in scenarios if scenario.get("type") == "erase"]
    recovery = [scenario for scenario in scenarios if scenario.get("type") == "recovery"]
    summary: dict[str, Any] = {"started_at": now(), "scenarios": {}}
    completed_erases: dict[str, str] = {}
    snapshots: dict[str, Path] = {}

    for scenario in erase:
        scenario_id = scenario["id"]
        try:
            snapshots[scenario_id] = RESULTS_DIR / f"manifest_snapshot_{scenario_id}.csv"
            run_erase(scenario, args, log)
            completed_erases[scenario_id] = now()
            summary["scenarios"][scenario_id] = {"status": "completed", "completed_at": completed_erases[scenario_id]}
        except Exception as exc:
            summary["scenarios"][scenario_id] = {"status": f"failed: {exc}"}
            log.exception("erase_failed scenario=%s", scenario_id)

    for scenario in recovery:
        scenario_id = scenario["id"]
        dependency = scenario.get("after_erase_id")
        if dependency and dependency not in completed_erases:
            summary["scenarios"][scenario_id] = {"status": "skipped: dependency not met", "dependency": dependency}
            log.error("recovery_skipped scenario=%s dependency=%s reason=dependency not met", scenario_id, dependency)
            continue
        try:
            # Guard again immediately before a recovery job touches the device.
            require_device_gate(args.volume, args.expected_serial, RESULTS_DIR)
            run_recovery(scenario, args, log, snapshots)
            summary["scenarios"][scenario_id] = {"status": "completed", "completed_at": now()}
        except Exception as exc:
            summary["scenarios"][scenario_id] = {"status": f"failed: {exc}"}
            log.exception("recovery_failed scenario=%s", scenario_id)

    summary["finished_at"] = now()
    (RESULTS_DIR / "run_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return 0 if all(value["status"] == "completed" for value in summary["scenarios"].values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
