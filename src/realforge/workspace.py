from __future__ import annotations

from pathlib import Path


def read_source(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_source(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def backup_path(path: Path, suffix: str = ".bak") -> Path:
    return path.with_suffix(path.suffix + suffix)


def create_backup(path: Path, suffix: str = ".bak") -> Path:
    dest = backup_path(path, suffix)
    dest.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    return dest
