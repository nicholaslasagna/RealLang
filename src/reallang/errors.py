from __future__ import annotations

from reallang.diagnostics import Diagnostic, format_diagnostic


class RealLangError(Exception):
    def __init__(self, diagnostic: Diagnostic) -> None:
        self.diagnostic = diagnostic
        super().__init__(format_diagnostic(diagnostic))


class LexError(RealLangError):
    pass


class ParseError(RealLangError):
    pass


class TypeError(RealLangError):
    pass
