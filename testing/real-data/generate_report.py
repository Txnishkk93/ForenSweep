"""Generate a compact CSV metrics report from harness results."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", type=Path, default=Path(__file__).resolve().parent.parent / "results")
    args = parser.parse_args()
    summary_path = args.results / "run_summary.json"
    output_path = args.results / "metrics_table.csv"
    summary = json.loads(summary_path.read_text(encoding="utf-8")) if summary_path.exists() else {"scenarios": {}}
    rows = []
    for scenario_id, result in summary.get("scenarios", {}).items():
        rows.append({"scenario_id": scenario_id, "status": result.get("status", ""), "completed_at": result.get("completed_at", "")})
    for manifest in sorted(args.results.glob("recovery_manifest_*.csv")):
        with manifest.open(newline="", encoding="utf-8") as handle:
            recovery_rows = list(csv.DictReader(handle))
        for row in rows:
            if manifest.stem == f"recovery_manifest_{row['scenario_id']}":
                row["evaluated_against"] = recovery_rows[0].get("evaluated_against", "") if recovery_rows else ""
                row["hash_matches"] = str(sum(item.get("match") == "True" for item in recovery_rows))
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["scenario_id", "status", "completed_at", "evaluated_against", "hash_matches"])
        writer.writeheader()
        writer.writerows(rows)
    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
