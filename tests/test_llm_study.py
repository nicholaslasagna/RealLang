import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BENCH_REAL = ROOT / "benchmarks" / "real"
SCORER = ROOT / "llm_study" / "score_submission.py"


def test_expected_files_exist():
    for task in ("loop_sum", "fibonacci_recursive", "branch_count", "function_call"):
        data = json.loads((ROOT / "llm_study/expected" / f"{task}.json").read_text(encoding="utf-8"))
        assert "expected_stdout" in data


def test_score_reference_loop_sum_reallang(tmp_path: Path):
    src = BENCH_REAL / "loop_sum.real"
    out = tmp_path / "score.json"
    proc = subprocess.run(
        [
            sys.executable,
            str(SCORER),
            "--task",
            "loop_sum",
            "--language",
            "reallang",
            "--file",
            str(src),
            "--first-try",
            "-o",
            str(out),
        ],
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr + proc.stdout
    record = json.loads(out.read_text(encoding="utf-8"))
    assert record["final_correct_output"] is True
    assert record["first_try_compile_success"] is True


def test_score_reference_loop_sum_c(tmp_path: Path):
    src = ROOT / "benchmarks" / "c" / "loop_sum.c"
    out = tmp_path / "score.json"
    proc = subprocess.run(
        [
            sys.executable,
            str(SCORER),
            "--task",
            "loop_sum",
            "--language",
            "c",
            "--file",
            str(src),
            "-o",
            str(out),
        ],
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr + proc.stdout
    record = json.loads(out.read_text(encoding="utf-8"))
    assert record["final_correct_output"] is True


def test_study_layout():
    study = ROOT / "llm_study"
    assert (study / "schema.json").is_file()
    assert (study / "prompts" / "reallang" / "loop_sum.md").is_file()
    assert (study / "prompts" / "c" / "loop_sum.md").is_file()
    assert (study / "prompts" / "cpp" / "loop_sum.md").is_file()
