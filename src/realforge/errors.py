from __future__ import annotations


class ProviderPlanError(Exception):
    """Structured error when a provider returns an unusable plan."""

    def __init__(self, provider: str, message: str, *, raw: str | None = None) -> None:
        self.provider = provider
        self.raw = raw
        detail = f"{provider} plan error: {message}"
        if raw:
            detail += f"\nraw response excerpt: {raw[:200]}"
        super().__init__(detail)
