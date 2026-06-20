from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from realforge.index.file_index import WorkspaceIndex, scan_workspace
from realforge.index.symbols import format_symbol_table, scan_workspace_symbols

DEFAULT_MAX_CHARS = 12000

SAFETY_RULES = """RealForge safety rules (v0.4):
- default permission mode is readonly
- no file writes unless explicitly requested with --apply and workspace-write permission
- all writes must stay inside the configured workspace root
- repair --apply rolls back on failed recheck unless --keep-failed-repair is set
- no cloud model providers; local adapters only
- RealForge is experimental and does not claim to outperform Codex, Claude Code, or Cursor"""


@dataclass(frozen=True)
class ContextBundle:
    task: str
    text: str
    max_chars: int
    truncated: bool


def _relative(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def _task_tokens(task: str) -> set[str]:
    tokens = set(re.findall(r"[A-Za-z0-9_.-]+", task.lower()))
    tokens.update(part.lower() for part in task.split() if part.strip())
    return tokens


def _matches_task(path: Path, root: Path, tokens: set[str]) -> bool:
    rel = _relative(path, root).lower()
    name = path.name.lower()
    stem = path.stem.lower()
    return any(token in rel or token == name or token == stem for token in tokens)


def _select_real_files(index: WorkspaceIndex, task: str) -> tuple[Path, ...]:
    tokens = _task_tokens(task)
    matched = [
        path
        for path in index.real_files
        if _matches_task(path, index.workspace_root, tokens)
    ]
    if matched:
        return tuple(matched)
    return index.real_files


def _select_tests(index: WorkspaceIndex, task: str) -> tuple[Path, ...]:
    tokens = _task_tokens(task)
    if not any(token in {"test", "tests", "pytest"} for token in tokens):
        return ()
    matched = [
        path
        for path in index.tests
        if _matches_task(path, index.workspace_root, tokens) or "test" in tokens
    ]
    return tuple(matched[:5])


def _select_benchmarks(index: WorkspaceIndex, task: str) -> tuple[Path, ...]:
    tokens = _task_tokens(task)
    if not any("benchmark" in token for token in tokens):
        return ()
    matched = [
        path
        for path in index.benchmarks
        if _matches_task(path, index.workspace_root, tokens)
    ]
    return tuple(matched[:5])


def _read_section(path: Path, root: Path) -> str:
    rel = _relative(path, root)
    content = path.read_text(encoding="utf-8").strip()
    return f"### {rel}\n{content}"


def _append_section(parts: list[str], header: str, body: str) -> None:
    if not body.strip():
        return
    parts.append(header)
    parts.append(body.strip())
    parts.append("")


def build_context(
    task: str,
    workspace_root: Path,
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
) -> ContextBundle:
    index = scan_workspace(workspace_root)
    root = index.workspace_root
    tokens = _task_tokens(task)
    parts: list[str] = [
        "# RealForge Context Bundle",
        "",
        "## Task",
        task.strip() or "(empty task)",
        "",
        "## Safety Rules",
        SAFETY_RULES,
        "",
    ]

    priority_docs: list[Path] = []
    for rel in ("README.md", "docs/project-status.md", "docs/language-semantics.md"):
        candidate = root / rel
        if candidate.is_file() and not any(p.resolve() == candidate.resolve() for p in priority_docs):
            priority_docs.append(candidate)

    doc_sections: list[str] = []
    for path in priority_docs:
        doc_sections.append(_read_section(path, root))
    for path in index.docs:
        if path.resolve() in {p.resolve() for p in priority_docs}:
            continue
        doc_sections.append(_read_section(path, root))
    _append_section(parts, "## Project Documentation", "\n\n".join(doc_sections))

    real_files = _select_real_files(index, task)
    real_sections: list[str] = []
    for path in real_files:
        real_sections.append(_read_section(path, root))
    _append_section(parts, "## RealLang Sources", "\n\n".join(real_sections))

    file_symbols = scan_workspace_symbols(real_files)
    symbol_text = format_symbol_table(file_symbols, workspace_root=root)
    _append_section(parts, "## Symbols", symbol_text)

    benchmark_files = _select_benchmarks(index, task)
    if benchmark_files:
        benchmark_sections = [_read_section(path, root) for path in benchmark_files]
        _append_section(parts, "## Benchmarks", "\n\n".join(benchmark_sections))

    test_files = _select_tests(index, task)
    if test_files:
        test_sections = [_read_section(path, root) for path in test_files]
        _append_section(parts, "## Tests", "\n\n".join(test_sections))

    summary_lines = [
        f"workspace: {root}",
        f"real files indexed: {len(index.real_files)}",
        f"docs indexed: {len(index.docs)}",
        f"tests indexed: {len(index.tests)}",
        f"benchmarks indexed: {len(index.benchmarks)}",
        f"task tokens: {', '.join(sorted(tokens))}",
    ]
    _append_section(parts, "## Workspace Summary", "\n".join(summary_lines))

    text = "\n".join(parts).strip()
    truncated = False
    if len(text) > max_chars:
        truncated = True
        notice = f"\n\n[truncated to {max_chars} characters]"
        keep = max_chars - len(notice)
        text = text[:keep].rstrip() + notice

    return ContextBundle(task=task, text=text, max_chars=max_chars, truncated=truncated)
