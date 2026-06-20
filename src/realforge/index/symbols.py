from __future__ import annotations

import re
from dataclasses import dataclass

FN_RE = re.compile(r"^\s*fn\s+(\w+)\s*\(", re.MULTILINE)
MODULE_RE = re.compile(r"^\s*module\s+(\w+)\s*;", re.MULTILINE)


@dataclass(frozen=True)
class Symbol:
    kind: str
    name: str


def extract_symbols(source: str) -> list[Symbol]:
    """Lightweight symbol scan (no parser dependency)."""
    symbols: list[Symbol] = []
    for match in MODULE_RE.finditer(source):
        symbols.append(Symbol(kind="module", name=match.group(1)))
    for match in FN_RE.finditer(source):
        symbols.append(Symbol(kind="function", name=match.group(1)))
    return symbols
