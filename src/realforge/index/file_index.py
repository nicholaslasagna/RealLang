from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class IndexedFile:
    path: Path
    suffix: str


def index_real_files(root: Path) -> list[IndexedFile]:
    """List .real sources under root (non-recursive scaffold for v0.1)."""
    if not root.is_dir():
        return []
    files: list[IndexedFile] = []
    for path in sorted(root.iterdir()):
        if path.is_file() and path.suffix == ".real":
            files.append(IndexedFile(path=path, suffix=path.suffix))
    return files
