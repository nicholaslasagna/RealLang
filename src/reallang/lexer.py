from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto

from reallang.diagnostics import lex_error
from reallang.errors import LexError


class TokenKind(Enum):
    MODULE = auto()
    FN = auto()
    LET = auto()
    VAR = auto()
    SET = auto()
    WHILE = auto()
    IF = auto()
    ELSE = auto()
    CONDITION = auto()
    RETURN = auto()
    I32 = auto()
    BOOL = auto()
    TRUE = auto()
    FALSE = auto()
    IDENT = auto()
    STRING = auto()
    INT = auto()
    ARROW = auto()
    COLON = auto()
    EQ = auto()
    COMMA = auto()
    PLUS = auto()
    MINUS = auto()
    STAR = auto()
    SLASH = auto()
    LT = auto()
    LE = auto()
    GT = auto()
    GE = auto()
    EQEQ = auto()
    NE = auto()
    LPAREN = auto()
    RPAREN = auto()
    LBRACE = auto()
    RBRACE = auto()
    SEMICOLON = auto()
    EOF = auto()


KEYWORDS: dict[str, TokenKind] = {
    "module": TokenKind.MODULE,
    "fn": TokenKind.FN,
    "let": TokenKind.LET,
    "var": TokenKind.VAR,
    "set": TokenKind.SET,
    "while": TokenKind.WHILE,
    "if": TokenKind.IF,
    "else": TokenKind.ELSE,
    "condition": TokenKind.CONDITION,
    "return": TokenKind.RETURN,
    "i32": TokenKind.I32,
    "bool": TokenKind.BOOL,
    "true": TokenKind.TRUE,
    "false": TokenKind.FALSE,
}


@dataclass(frozen=True)
class Token:
    kind: TokenKind
    lexeme: str
    line: int
    column: int


def lex(source: str, *, file: str | None = None) -> list[Token]:
    tokens: list[Token] = []
    i = 0
    line = 1
    column = 1

    def emit(kind: TokenKind, lexeme: str, start_line: int, start_col: int) -> None:
        tokens.append(Token(kind, lexeme, start_line, start_col))

    def fail(
        code: str,
        problem: str,
        err_line: int,
        err_col: int,
        *,
        why: str | None = None,
        expected: str | None = None,
        found: str | None = None,
        repair: str | None = None,
    ) -> None:
        raise LexError(
            lex_error(
                code,
                problem,
                file=file,
                line=err_line,
                column=err_col,
                why=why,
                expected=expected,
                found=found,
                repair=repair,
            )
        )

    while i < len(source):
        ch = source[i]

        if ch in " \t\r":
            i += 1
            column += 1
            continue

        if ch == "\n":
            i += 1
            line += 1
            column = 1
            continue

        if ch == "/" and i + 1 < len(source) and source[i + 1] == "/":
            i += 2
            column += 2
            while i < len(source) and source[i] != "\n":
                i += 1
                column += 1
            continue

        start_line, start_col = line, column

        if ch.isalpha() or ch == "_":
            start = i
            while i < len(source) and (source[i].isalnum() or source[i] == "_"):
                i += 1
            column += i - start
            word = source[start:i]
            kind = KEYWORDS.get(word, TokenKind.IDENT)
            emit(kind, word, start_line, start_col)
            continue

        if ch.isdigit():
            start = i
            while i < len(source) and source[i].isdigit():
                i += 1
            column += i - start
            emit(TokenKind.INT, source[start:i], start_line, start_col)
            continue

        if ch == '"':
            i += 1
            column += 1
            value_chars: list[str] = []
            while i < len(source) and source[i] != '"':
                if source[i] == "\\":
                    if i + 1 >= len(source):
                        fail(
                            "E002",
                            "Unterminated string escape sequence.",
                            line,
                            column,
                            repair='Close the escape (for example \\n) before the closing quote.',
                        )
                    esc = source[i + 1]
                    if esc == "n":
                        value_chars.append("\n")
                    elif esc == "t":
                        value_chars.append("\t")
                    elif esc == "\\":
                        value_chars.append("\\")
                    elif esc == '"':
                        value_chars.append('"')
                    else:
                        fail(
                            "E002",
                            f"Invalid escape sequence '\\{esc}'.",
                            line,
                            column,
                            expected="\\n, \\t, \\\\, or \\\"",
                            found=f"\\{esc}",
                        )
                    i += 2
                    column += 2
                    continue
                if source[i] == "\n":
                    fail(
                        "E002",
                        "Unterminated string literal.",
                        line,
                        column,
                        repair='Add a closing double quote (").',
                    )
                value_chars.append(source[i])
                i += 1
                column += 1
            if i >= len(source):
                fail(
                    "E002",
                    "Unterminated string literal.",
                    start_line,
                    start_col,
                    repair='Add a closing double quote (").',
                )
            i += 1
            column += 1
            emit(TokenKind.STRING, "".join(value_chars), start_line, start_col)
            continue

        two_char = source[i : i + 2]
        two_char_ops = {
            "->": TokenKind.ARROW,
            "<=": TokenKind.LE,
            ">=": TokenKind.GE,
            "==": TokenKind.EQEQ,
            "!=": TokenKind.NE,
        }
        if two_char in two_char_ops:
            emit(two_char_ops[two_char], two_char, start_line, start_col)
            i += 2
            column += 2
            continue

        single_map = {
            ":": TokenKind.COLON,
            "=": TokenKind.EQ,
            ",": TokenKind.COMMA,
            "+": TokenKind.PLUS,
            "-": TokenKind.MINUS,
            "*": TokenKind.STAR,
            "/": TokenKind.SLASH,
            "<": TokenKind.LT,
            ">": TokenKind.GT,
            "(": TokenKind.LPAREN,
            ")": TokenKind.RPAREN,
            "{": TokenKind.LBRACE,
            "}": TokenKind.RBRACE,
            ";": TokenKind.SEMICOLON,
        }
        if ch in single_map:
            emit(single_map[ch], ch, start_line, start_col)
            i += 1
            column += 1
            continue

        fail(
            "E001",
            f"Unknown token {ch!r}.",
            line,
            column,
            why="RealLang source can only contain recognized letters, digits, operators, and punctuation.",
            repair="Remove the character or rewrite it using supported RealLang syntax.",
        )

    emit(TokenKind.EOF, "", line, column)
    return tokens
