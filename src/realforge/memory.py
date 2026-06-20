from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class SessionMemory:
    """In-process session notes for agent loops (v0.1)."""

    task: str = ""
    entries: list[dict[str, Any]] = field(default_factory=list)

    def record(self, kind: str, payload: dict[str, Any]) -> None:
        self.entries.append({"kind": kind, **payload})

    def last(self, kind: str | None = None) -> dict[str, Any] | None:
        if kind is None:
            return self.entries[-1] if self.entries else None
        for entry in reversed(self.entries):
            if entry.get("kind") == kind:
                return entry
        return None
