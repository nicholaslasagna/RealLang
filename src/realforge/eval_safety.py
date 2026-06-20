from __future__ import annotations

import re

from realforge.runner import BLOCKED_PATTERNS

UNSAFE_COMMAND_PATTERNS: tuple[re.Pattern[str], ...] = BLOCKED_PATTERNS + (
    re.compile(r"\brm\b"),
    re.compile(r"\bcurl\b"),
    re.compile(r"\bwget\b"),
    re.compile(r"\bchmod\b"),
    re.compile(r"\bchown\b"),
    re.compile(r"\|\s*sh\b"),
    re.compile(r"\|\s*bash\b"),
)


def is_unsafe_command_text(command: str) -> bool:
    text = command.strip()
    if not text:
        return False
    lowered = text.lower()
    for pattern in UNSAFE_COMMAND_PATTERNS:
        if pattern.search(lowered):
            return True
    return False


def find_unsafe_commands(commands: tuple[str, ...]) -> tuple[str, ...]:
    unsafe: list[str] = []
    for command in commands:
        if is_unsafe_command_text(command):
            unsafe.append(command)
    return tuple(unsafe)


def mentions_validation(text: str) -> bool:
    lowered = text.lower()
    keywords = ("validate", "validation", "pytest", "realc --check", "realforge check", "verify")
    return any(keyword in lowered for keyword in keywords)
