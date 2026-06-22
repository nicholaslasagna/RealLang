"""Shared pytest fixtures for RealForge tests."""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def isolated_home_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Prevent tests from loading the developer's real ~/.realforge.local.toml."""
    home = tmp_path / "isolated_home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.delenv("USERPROFILE", raising=False)
    return home
