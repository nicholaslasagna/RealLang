from __future__ import annotations

import re
from dataclasses import dataclass

HEADER_RE = re.compile(r"^(REAL_(?:LEX|PARSE|TYPE)_ERROR)\[(E\d+)\]$")
FILE_RE = re.compile(r"^File: (.+)$")
LINE_RE = re.compile(r"^Line: (\d+)$")
COLUMN_RE = re.compile(r"^Column: (\d+)$")
EXPECTED_RE = re.compile(r"^Expected: (.+)$")
FOUND_RE = re.compile(r"^Found: (.+)$")


@dataclass(frozen=True)
class ParsedDiagnostic:
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


def _strip_section(lines: list[str]) -> str:
    parts: list[str] = []
    for line in lines:
        if line.startswith("  "):
            parts.append(line[2:])
        elif line.strip():
            parts.append(line)
    return "\n".join(parts).strip()


def parse_diagnostics(text: str) -> list[ParsedDiagnostic]:
    if not text.strip():
        return []

    blocks = re.split(r"\n(?=REAL_(?:LEX|PARSE|TYPE)_ERROR\[E\d+\])", text.strip())
    results: list[ParsedDiagnostic] = []

    for block in blocks:
        lines = block.splitlines()
        if not lines:
            continue
        header = HEADER_RE.match(lines[0].strip())
        if not header:
            continue

        kind, code = header.group(1), header.group(2)
        file_path: str | None = None
        line_no: int | None = None
        column_no: int | None = None
        expected: str | None = None
        found: str | None = None
        problem_lines: list[str] = []
        why_lines: list[str] = []
        repair_lines: list[str] = []
        section: str | None = None

        for raw in lines[1:]:
            line = raw.rstrip("\n")
            stripped = line.strip()
            if stripped == "Problem:":
                section = "problem"
                continue
            if stripped == "Why:":
                section = "why"
                continue
            if stripped == "Suggested repair:":
                section = "repair"
                continue

            m = FILE_RE.match(stripped)
            if m:
                file_path = m.group(1)
                section = None
                continue
            m = LINE_RE.match(stripped)
            if m:
                line_no = int(m.group(1))
                section = None
                continue
            m = COLUMN_RE.match(stripped)
            if m:
                column_no = int(m.group(1))
                section = None
                continue
            m = EXPECTED_RE.match(stripped)
            if m:
                expected = m.group(1)
                section = None
                continue
            m = FOUND_RE.match(stripped)
            if m:
                found = m.group(1)
                section = None
                continue

            if section == "problem":
                problem_lines.append(line)
            elif section == "why":
                why_lines.append(line)
            elif section == "repair":
                repair_lines.append(line)

        problem = _strip_section(problem_lines)
        if not problem:
            continue

        results.append(
            ParsedDiagnostic(
                kind=kind,
                code=code,
                problem=problem,
                file=file_path,
                line=line_no,
                column=column_no,
                why=_strip_section(why_lines) or None,
                expected=expected,
                found=found,
                repair=_strip_section(repair_lines) or None,
            )
        )

    return results
