import pytest

from reallang.errors import ParseError, TypeError as RealTypeError
from reallang.lexer import lex
from reallang.parser import parse
from reallang.typecheck import typecheck


def _diag(exc: Exception):
    return exc.diagnostic  # type: ignore[attr-defined]


def test_missing_semicolon_diagnostic():
    source = "module main;\nfn main() -> i32 { return 0 }\n"
    with pytest.raises(ParseError) as exc:
        parse(lex(source, file="bad.real"), file="bad.real")
    d = _diag(exc.value)
    assert d.code == "E101"
    assert "bad.real" in str(exc.value)
    assert "Expected: ';'" in str(exc.value)


def test_missing_paren_diagnostic():
    source = "module main;\nfn main(a: i32 -> i32 { return 0; }\n"
    with pytest.raises(ParseError) as exc:
        parse(lex(source), file="x.real")
    assert _diag(exc.value).code == "E102"


def test_missing_brace_diagnostic():
    source = "module main;\nfn main() -> i32 { return 0;\n"
    with pytest.raises(ParseError) as exc:
        parse(lex(source), file="x.real")
    assert _diag(exc.value).code == "E103"


def test_unknown_token_diagnostic():
    with pytest.raises(Exception) as exc:
        lex("@", file="x.real")
    from reallang.errors import LexError

    assert isinstance(exc.value, LexError)
    assert _diag(exc.value).code == "E001"


def test_unknown_variable_diagnostic():
    source = "module main;\nfn main() -> i32 { return x; }\n"
    with pytest.raises(RealTypeError) as exc:
        typecheck(parse(lex(source), file="bad.real"), file="bad.real")
    d = _diag(exc.value)
    assert d.code == "E201"
    assert "Unknown variable" in d.problem


def test_set_on_let_diagnostic():
    source = """module main;
fn main() -> i32 {
  let x: i32 = 10;
  set x = 20;
  return 0;
}
"""
    with pytest.raises(RealTypeError) as exc:
        typecheck(parse(lex(source), file="examples/bad.real"), file="examples/bad.real")
    d = _diag(exc.value)
    assert d.code == "E203"
    assert "immutable" in d.problem
    assert "let x" in d.repair
    assert "var x" in d.repair


def test_set_type_mismatch_diagnostic():
    source = """module main;
fn main() -> i32 {
  var x: i32 = 1;
  set x = true;
  return 0;
}
"""
    with pytest.raises(RealTypeError) as exc:
        typecheck(parse(lex(source)), file="x.real")
    assert _diag(exc.value).code == "E204"


def test_wrong_arity_diagnostic():
    source = """module main;
fn add(a: i32, b: i32) -> i32 { return a + b; }
fn main() -> i32 { let x: i32 = add(1); return 0; }
"""
    with pytest.raises(RealTypeError) as exc:
        typecheck(parse(lex(source)), file="x.real")
    assert _diag(exc.value).code == "E205"


def test_wrong_arg_type_diagnostic():
    source = """module main;
fn main() -> i32 { print_i32(true); return 0; }
"""
    with pytest.raises(RealTypeError) as exc:
        typecheck(parse(lex(source)), file="x.real")
    assert _diag(exc.value).code == "E206"


def test_non_bool_while_diagnostic():
    source = """module main;
fn main() -> i32 {
  var i: i32 = 0;
  while condition(i) { set i = i + 1; }
  return 0;
}
"""
    with pytest.raises(RealTypeError) as exc:
        typecheck(parse(lex(source)), file="x.real")
    assert _diag(exc.value).code == "E208"


def test_non_bool_if_diagnostic():
    source = """module main;
fn main() -> i32 {
  let x: i32 = 1;
  if condition(x) { return 0; } else { return 1; }
}
"""
    with pytest.raises(RealTypeError) as exc:
        typecheck(parse(lex(source)), file="x.real")
    assert _diag(exc.value).code == "E207"


def test_missing_main_diagnostic():
    source = "module x;\nfn other() -> i32 { return 0; }\n"
    with pytest.raises(RealTypeError) as exc:
        typecheck(parse(lex(source)), file="x.real")
    assert _diag(exc.value).code == "E210"


def test_bool_literals_typecheck():
    source = """module main;
fn main() -> i32 { print_bool(true); return 0; }
"""
    typecheck(parse(lex(source)), file="ok.real")
