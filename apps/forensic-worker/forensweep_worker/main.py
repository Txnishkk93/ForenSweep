from __future__ import annotations

import argparse
import sys

from .api_client import WorkerApiClient
from .config import load_config
from .jobs.erase_job import run_erase


def main() -> int:
    parser = argparse.ArgumentParser(prog="forensweep-worker")
    commands = parser.add_subparsers(dest="command", required=True)
    erase = commands.add_parser("erase")
    erase.add_argument("--job-id", required=True)
    args = parser.parse_args()
    config = load_config()
    client = WorkerApiClient(config)
    try:
        if args.command == "erase":
            run_erase(args.job_id, config, client)
        return 0
    except Exception as error:
        try:
            client.fail(args.job_id, {"message": str(error), "detail": {"worker": "forensweep-worker"}})
        except Exception:
            pass
        print(f"worker failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
