from pathlib import Path

import pytest

from reallang.codegen import emit_c
from reallang.errors import TypeError as RealTypeError
from reallang.lexer import lex
from reallang.parser import parse
from reallang.typecheck import typecheck

HELLO = Path(__file__).resolve().parents[1] / "examples" / "hello.real"
ADD = Path(__file__).resolve().parents[1] / "examples" / "add.real"
LOOPTEST = Path(__file__).resolve().parents[1] / "examples" / "looptest.real"
CONDITION = Path(__file__).resolve().parents[1] / "examples" / "condition.real"


def test_emit_hello_c():
    module = typecheck(parse(lex(HELLO.read_text(encoding="utf-8"))))
    c = emit_c(module)
    assert "int main(void) {" in c


def test_emit_add_c():
    module = typecheck(parse(lex(ADD.read_text(encoding="utf-8"))))
    c = emit_c(module)
    assert "int z = add(x, y);" in c


def test_emit_looptest_c():
    module = typecheck(parse(lex(LOOPTEST.read_text(encoding="utf-8"))))
    c = emit_c(module)
    assert "int i = 0;" in c
    assert "int total = 0;" in c
    assert "while (i < 1000000) {" in c
    assert "total = total + i;" in c
    assert "i = i + 1;" in c
    assert 'printf("%d\\n", total);' in c


def test_emit_condition_c():
    module = typecheck(parse(lex(CONDITION.read_text(encoding="utf-8"))))
    c = emit_c(module)
    assert "if (x == 10) {" in c
    assert 'printf("%s\\n", "true");' in c
    assert "} else {" in c
    assert 'printf("%s\\n", "false");' in c


def test_typecheck_requires_main():
    source = "module x;\nfn other() -> i32 { return 0; }\n"
    with pytest.raises(RealTypeError, match="E210"):
        typecheck(parse(lex(source)))
