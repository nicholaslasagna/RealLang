from __future__ import annotations

import difflib


def unified_diff(before: str, after: str, fromfile: str = "before", tofile: str = "after") -> str:
    before_lines = before.splitlines(keepends=True)
    after_lines = after.splitlines(keepends=True)
    diff = difflib.unified_diff(before_lines, after_lines, fromfile=fromfile, tofile=tofile)
    return "".join(diff)
