from __future__ import annotations

import argparse
import sys
from pathlib import Path

from realforge.repair_loop import check_file, repair_file
from realforge.report import format_check_fail, format_check_pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="realforge",
        description="RealForge — local coding-agent layer for RealLang",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    check = sub.add_parser("check", help="run realc --check and summarize diagnostics")
    check.add_argument("file", type=Path, help="RealLang source file (.real)")

    repair = sub.add_parser("repair", help="rule-based repair from realc diagnostics")
    repair.add_argument("file", type=Path, help="RealLang source file (.real)")
    mode = repair.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="show diff without writing")
    mode.add_argument("--apply", action="store_true", help="apply safe repairs with backup")

    args = parser.parse_args(argv)

    if args.command == "check":
        if not args.file.is_file():
            print(f"error: file not found: {args.file}", file=sys.stderr)
            return 1
        outcome = check_file(args.file)
        if outcome.ok:
            print(format_check_pass(args.file))
            if outcome.stdout.strip():
                print(outcome.stdout.strip())
            return 0
        print(format_check_fail(args.file, outcome.diagnostics), file=sys.stderr)
        return 1

    if args.command == "repair":
        if not args.file.is_file():
            print(f"error: file not found: {args.file}", file=sys.stderr)
            return 1
        outcome = repair_file(args.file, dry_run=args.dry_run)
        stream = sys.stdout if outcome.ok or args.dry_run else sys.stderr
        print(outcome.message, file=stream)
        return 0 if outcome.ok else 1

    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
