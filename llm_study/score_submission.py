#!/usr/bin/env python3
"""Score one AI/human submission for the RealLang LLM reliability study (v0.1)."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

STUDY_VERSION = "0.1"
TASKS = ("loop_sum", "fibonacci_recursive", "branch_count", "function_call")
LANGUAGES = ("reallang", "c", "cpp")
EXT = {"reallang": ".real", "c": ".c", "cpp": ".cpp"}


def study_root() -> Path:
    return Path(__file__).resolve().parent


def repo_root() -> Path:
    return study_root().parents[0]


def load_expected(task: str) -> dict:
    path = study_root() / "expected" / f"{task}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _tool_env(root: Path) -> dict[str, str]:
    env = os.environ.copy()
    src = str(root / "src")
    env["PYTHONPATH"] = src if "PYTHONPATH" not in env else f"{src}{os.pathsep}{env['PYTHONPATH']}"
    return env


def compile_and_run(
    language: str, source: Path, work: Path, root: Path
) -> tuple[bool, str, str, float | None]:
    """Returns (compile_ok, stdout, compile_log, runtime_ms)."""
    log_parts: list[str] = []
    binary = work / "prog"
    env = _tool_env(root)

    try:
        if language == "reallang":
            emitted = work / "out.c"
            realc = shutil.which("realc")
            if realc:
                cmd = [realc, str(source), "--emit-c", "-o", str(emitted)]
            else:
                cmd = [sys.executable, "-m", "reallang.cli", str(source), "--emit-c", "-o", str(emitted)]
            proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
            log_parts.append(proc.stdout + proc.stderr)
            if proc.returncode != 0:
                return False, "", "\n".join(log_parts), None
            cc = subprocess.run(
                ["cc", "-std=c11", "-O2", "-Wall", "-Wextra", str(emitted), "-o", str(binary)],
                capture_output=True,
                text=True,
            )
            log_parts.append(cc.stdout + cc.stderr)
            if cc.returncode != 0:
                return False, "", "\n".join(log_parts), None
        elif language == "c":
            proc = subprocess.run(
                ["cc", "-std=c11", "-O2", "-Wall", "-Wextra", str(source), "-o", str(binary)],
                capture_output=True,
                text=True,
            )
            log_parts.append(proc.stdout + proc.stderr)
            if proc.returncode != 0:
                return False, "", "\n".join(log_parts), None
        elif language == "cpp":
            proc = subprocess.run(
                ["c++", "-std=c++17", "-O2", "-Wall", "-Wextra", str(source), "-o", str(binary)],
                capture_output=True,
                text=True,
            )
            log_parts.append(proc.stdout + proc.stderr)
            if proc.returncode != 0:
                return False, "", "\n".join(log_parts), None
        else:
            raise ValueError(language)

        start = time.perf_counter()
        run = subprocess.run([str(binary)], capture_output=True, text=True, check=True)
        runtime_ms = (time.perf_counter() - start) * 1000.0
        return True, run.stdout.strip(), "\n".join(log_parts), runtime_ms
    except subprocess.CalledProcessError as err:
        log_parts.append(err.stdout or "")
        log_parts.append(err.stderr or "")
        stdout = (err.stdout or "").strip()
        return False, stdout, "\n".join(log_parts), None
    except OSError as err:
        return False, "", str(err), None


def build_record(
    *,
    task: str,
    language: str,
    source_file: Path,
    first_try_compile: bool,
    first_try_correct: bool,
    repair_attempts: int,
    final_compile: bool,
    final_correct: bool,
    stdout: str,
    expected: str,
    compile_log: str,
    runtime_ms: float | None,
    token_estimate: int | None,
    agent_id: str | None,
    notes: str | None,
) -> dict:
    return {
        "study_version": STUDY_VERSION,
        "task": task,
        "language": language,
        "source_file": str(source_file),
        "agent_id": agent_id,
        "first_try_compile_success": first_try_compile,
        "first_try_correct_output": first_try_correct,
        "repair_attempts": repair_attempts,
        "final_compile_success": final_compile,
        "final_correct_output": final_correct,
        "token_count_estimate": token_estimate,
        "runtime_ms_if_available": runtime_ms,
        "stdout": stdout,
        "expected_stdout": expected,
        "compile_log": compile_log,
        "notes": notes or "",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Score one LLM study submission")
    parser.add_argument("--task", required=True, choices=TASKS)
    parser.add_argument("--language", required=True, choices=LANGUAGES)
    parser.add_argument("--file", type=Path, required=True, help="submitted source file")
    parser.add_argument("--repair-attempts", type=int, default=0, help="manual repair count")
    parser.add_argument("--first-try", action="store_true", help="this file is the first attempt")
    parser.add_argument("--token-estimate", type=int, default=None)
    parser.add_argument("--agent-id", default=None)
    parser.add_argument("--notes", default=None)
    parser.add_argument("-o", "--output", type=Path, help="write JSON record to file")
    args = parser.parse_args(argv)

    root = repo_root()
    expected = load_expected(args.task)["expected_stdout"]
    source = args.file.resolve()
    if not source.is_file():
        print(f"error: file not found: {source}", file=sys.stderr)
        return 1

    with tempfile.TemporaryDirectory(prefix="reallang-study-") as tmp:
        work = Path(tmp)
        compile_ok, stdout, clog, runtime_ms = compile_and_run(
            args.language, source, work, root
        )

    correct = compile_ok and stdout == expected
    first_compile = compile_ok if args.first_try else False
    first_correct = correct if args.first_try else False

    record = build_record(
        task=args.task,
        language=args.language,
        source_file=source,
        first_try_compile=first_compile,
        first_try_correct=first_correct,
        repair_attempts=args.repair_attempts,
        final_compile=compile_ok,
        final_correct=correct,
        stdout=stdout,
        expected=expected,
        compile_log=clog,
        runtime_ms=runtime_ms,
        token_estimate=args.token_estimate,
        agent_id=args.agent_id,
        notes=args.notes,
    )

    payload = json.dumps(record, indent=2) + "\n"
    if args.output:
        args.output.write_text(payload, encoding="utf-8")
    else:
        print(payload, end="")
    return 0 if correct else 1


if __name__ == "__main__":
    raise SystemExit(main())
