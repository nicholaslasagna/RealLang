from pathlib import Path

from reallang.lexer import TokenKind, lex

HELLO = Path(__file__).resolve().parents[1] / "examples" / "hello.real"
ADD = Path(__file__).resolve().parents[1] / "examples" / "add.real"
LOOPTEST = Path(__file__).resolve().parents[1] / "examples" / "looptest.real"
CONDITION = Path(__file__).resolve().parents[1] / "examples" / "condition.real"


def test_hello_tokens():
    source = '''module main;
fn main() -> i32 {
  print_str("Hello from RealLang");
  return 0;
}
'''
    kinds = [t.kind for t in lex(source)]
    assert kinds == [
        TokenKind.MODULE,
        TokenKind.IDENT,
        TokenKind.SEMICOLON,
        TokenKind.FN,
        TokenKind.IDENT,
        TokenKind.LPAREN,
        TokenKind.RPAREN,
        TokenKind.ARROW,
        TokenKind.I32,
        TokenKind.LBRACE,
        TokenKind.IDENT,
        TokenKind.LPAREN,
        TokenKind.STRING,
        TokenKind.RPAREN,
        TokenKind.SEMICOLON,
        TokenKind.RETURN,
        TokenKind.INT,
        TokenKind.SEMICOLON,
        TokenKind.RBRACE,
        TokenKind.EOF,
    ]


def test_lex_add_real():
    kinds = [t.kind for t in lex(ADD.read_text(encoding="utf-8"))]
    assert TokenKind.LET in kinds
    assert TokenKind.PLUS in kinds


def test_lex_milestone3_keywords():
    kinds = [t.kind for t in lex(LOOPTEST.read_text(encoding="utf-8"))]
    assert TokenKind.VAR in kinds
    assert TokenKind.SET in kinds
    assert TokenKind.WHILE in kinds
    assert TokenKind.CONDITION in kinds
    assert TokenKind.LT in kinds

    cond_kinds = [t.kind for t in lex(CONDITION.read_text(encoding="utf-8"))]
    assert TokenKind.IF in cond_kinds
    assert TokenKind.ELSE in cond_kinds
    assert TokenKind.TRUE in cond_kinds
    assert TokenKind.FALSE in cond_kinds
    assert TokenKind.EQEQ in cond_kinds


def test_string_escape():
    tokens = lex(r'print_str("a\nb");')
    string_tok = next(t for t in tokens if t.kind == TokenKind.STRING)
    assert string_tok.lexeme == "a\nb"
