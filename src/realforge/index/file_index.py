from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from realforge.permissions import PermissionMode, Permissions
from realforge.workspace import assert_can_write

IGNORED_DIR_NAMES = frozenset(
    {
        ".git",
        ".venv",
        "venv",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        "build",
        "dist",
        ".realforge",
    }
)

IGNORED_PATH_PARTS = frozenset(
    {
        "benchmarks/build",
        "benchmarks/results",
        "llm_study/results",
    }
)

IGNORED_FILE_SUFFIXES = frozenset({".pyc", ".pyo", ".o", ".out", ".egg-info"})


@dataclass(frozen=True)
class WorkspaceIndex:
    workspace_root: Path
    real_files: tuple[Path, ...]
    docs: tuple[Path, ...]
    tests: tuple[Path, ...]
    benchmarks: tuple[Path, ...]

    def to_dict(self) -> dict:
        def rel(paths: tuple[Path, ...]) -> list[str]:
            root = self.workspace_root.resolve()
            return [str(path.resolve().relative_to(root)) for path in paths]

        return {
            "workspace_root": str(self.workspace_root.resolve()),
            "generated_at": datetime.now(UTC).isoformat(),
            "real_files": rel(self.real_files),
            "docs": rel(self.docs),
            "tests": rel(self.tests),
            "benchmarks": rel(self.benchmarks),
        }


def _relative_posix(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def should_ignore_path(path: Path, workspace_root: Path) -> bool:
    root = workspace_root.resolve()
    try:
        rel = path.resolve().relative_to(root)
    except ValueError:
        return True

    rel_posix = rel.as_posix()
    for part in IGNORED_PATH_PARTS:
        if rel_posix == part or rel_posix.startswith(part + "/"):
            return True

    for part in rel.parts:
        if part in IGNORED_DIR_NAMES:
            return True
        if part.endswith(".egg-info"):
            return True

    if path.is_file():
        if path.suffix in IGNORED_FILE_SUFFIXES:
            return True
        if path.name.endswith(".real.bak") or ".real.bak." in path.name:
            return True
        if path.suffix == ".c" and "benchmarks/c" not in rel_posix:
            return True

    return False


def scan_workspace(workspace_root: Path) -> WorkspaceIndex:
    root = workspace_root.resolve()
    if not root.is_dir():
        return WorkspaceIndex(root, (), (), (), ())

    real_files: list[Path] = []
    docs: list[Path] = []
    tests: list[Path] = []
    benchmarks: list[Path] = []

    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if should_ignore_path(path, root):
            continue

        rel = _relative_posix(path, root)
        if path.suffix == ".real":
            real_files.append(path)
            continue
        if rel == "README.md" or rel.startswith("docs/") and path.suffix == ".md":
            docs.append(path)
            continue
        if rel.startswith("tests/") and path.suffix == ".py":
            tests.append(path)
            continue
        if rel.startswith("benchmarks/"):
            benchmarks.append(path)

    return WorkspaceIndex(
        workspace_root=root,
        real_files=tuple(real_files),
        docs=tuple(docs),
        tests=tuple(tests),
        benchmarks=tuple(benchmarks),
    )


def default_cache_path(workspace_root: Path) -> Path:
    return workspace_root / ".realforge" / "index.json"


def format_index_report(index: WorkspaceIndex) -> str:
    lines = [
        "RealForge workspace index",
        f"workspace: {index.workspace_root}",
        "",
        f"real files ({len(index.real_files)}):",
    ]
    for path in index.real_files:
        lines.append(f"  - {_relative_posix(path, index.workspace_root)}")
    lines.append("")
    lines.append(f"docs ({len(index.docs)}):")
    for path in index.docs:
        lines.append(f"  - {_relative_posix(path, index.workspace_root)}")
    lines.append("")
    lines.append(f"tests ({len(index.tests)}):")
    for path in index.tests:
        lines.append(f"  - {_relative_posix(path, index.workspace_root)}")
    lines.append("")
    lines.append(f"benchmarks ({len(index.benchmarks)}):")
    for path in index.benchmarks:
        lines.append(f"  - {_relative_posix(path, index.workspace_root)}")
    return "\n".join(lines)


def write_index_cache(
    index: WorkspaceIndex,
    *,
    cache_path: Path | None = None,
    permissions: Permissions | None = None,
) -> Path:
    root = index.workspace_root
    target = cache_path or default_cache_path(root)
    perms = permissions or Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=root)
    assert_can_write(target, perms)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(index.to_dict(), indent=2) + "\n", encoding="utf-8")
    return target
