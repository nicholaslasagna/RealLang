# Contributing to RealLang

RealLang is an early compiler project. Contributions should be small,
test-backed, and honest about the current implementation.

## Project principles

- Do not restart the compiler from scratch.
- Do not rewrite major subsystems without a narrow design note and tests.
- Prefer small vertical milestones over broad feature branches.
- Add tests for every compiler behavior change.
- Keep documentation claims tied to implemented behavior or measured results.
- Do not claim RealLang is faster than Rust, C, or C++ without narrow benchmark
  evidence.

## Development setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

The `realc` command is installed by the editable package.

## Test expectations

For compiler changes, run:

```bash
pytest
```

When changing code generation, also make sure generated examples compile with:

```bash
cc -std=c11 -Wall -Wextra
```

The test suite already covers this for the checked-in examples and benchmark
RealLang programs.

## Documentation expectations

Documentation should separate:

- implemented behavior
- intended semantics
- known limitations
- future work
- research hypotheses
- measured results

Do not present methodology, planned work, or hypotheses as completed results.

## Benchmark expectations

Benchmark changes should include correctness checks and should report the
compiler flags and methodology used. Broad performance conclusions require more
than the current smoke-test harness.

## LLM study expectations

LLM reliability claims require scored study data. The framework in
`llm_study/` is methodology and tooling only until result records are generated
and reviewed.

## Pull request checklist

Before opening a pull request:

- keep the scope narrow
- add or update tests
- run the full test suite
- update docs when behavior or claims change
- note known limitations instead of hiding them

