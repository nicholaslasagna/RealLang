from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Diagnostic:
    kind: str
    code: str
    problem: str
    file: str | None = None
    line: int | None = None
    column: int | None = None
    why: str | None = None
    expected: str | None = None
    found: str | None = None
    repair: str | None = None


def format_diagnostic(diag: Diagnostic) -> str:
    lines = [f"{diag.kind}[{diag.code}]"]
    if diag.file:
        lines.append(f"File: {diag.file}")
    if diag.line is not None:
        col = f"\nColumn: {diag.column}" if diag.column is not None else ""
        lines.append(f"Line: {diag.line}{col}")
    lines.append("Problem:")
    lines.append(f"  {diag.problem}")
    if diag.why:
        lines.append("Why:")
        for part in diag.why.splitlines():
            lines.append(f"  {part}")
    if diag.expected:
        lines.append(f"Expected: {diag.expected}")
    if diag.found:
        lines.append(f"Found: {diag.found}")
    if diag.repair:
        lines.append("Suggested repair:")
        for part in diag.repair.splitlines():
            lines.append(f"  {part}")
    return "\n".join(lines)


def lex_error(
    code: str,
    problem: str,
    *,
    file: str | None = None,
    line: int | None = None,
    column: int | None = None,
    why: str | None = None,
    expected: str | None = None,
    found: str | None = None,
    repair: str | None = None,
) -> Diagnostic:
    return Diagnostic(
        kind="REAL_LEX_ERROR",
        code=code,
        problem=problem,
        file=file,
        line=line,
        column=column,
        why=why,
        expected=expected,
        found=found,
        repair=repair,
    )


def parse_error(
    code: str,
    problem: str,
    *,
    file: str | None = None,
    line: int | None = None,
    column: int | None = None,
    why: str | None = None,
    expected: str | None = None,
    found: str | None = None,
    repair: str | None = None,
) -> Diagnostic:
    return Diagnostic(
        kind="REAL_PARSE_ERROR",
        code=code,
        problem=problem,
        file=file,
        line=line,
        column=column,
        why=why,
        expected=expected,
        found=found,
        repair=repair,
    )


def type_error(
    code: str,
    problem: str,
    *,
    file: str | None = None,
    line: int | None = None,
    column: int | None = None,
    why: str | None = None,
    expected: str | None = None,
    found: str | None = None,
    repair: str | None = None,
) -> Diagnostic:
    return Diagnostic(
        kind="REAL_TYPE_ERROR",
        code=code,
        problem=problem,
        file=file,
        line=line,
        column=column,
        why=why,
        expected=expected,
        found=found,
        repair=repair,
    )
