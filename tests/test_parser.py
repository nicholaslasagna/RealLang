from pathlib import Path

from reallang import ast_nodes as ast
from reallang.lexer import lex
from reallang.parser import parse

HELLO = Path(__file__).resolve().parents[1] / "examples" / "hello.real"
ADD = Path(__file__).resolve().parents[1] / "examples" / "add.real"
LOOPTEST = Path(__file__).resolve().parents[1] / "examples" / "looptest.real"
CONDITION = Path(__file__).resolve().parents[1] / "examples" / "condition.real"


def test_parse_hello_example():
    module = parse(lex(HELLO.read_text(encoding="utf-8")))
    assert module.name == "main"
    assert len(module.functions) == 1


def test_parse_function_parameters():
    module = parse(lex(ADD.read_text(encoding="utf-8")))
    add_fn = module.functions[0]
    assert len(add_fn.params) == 2


def test_parse_let_declarations():
    module = parse(lex(ADD.read_text(encoding="utf-8")))
    main_fn = module.functions[1]
    lets = [s for s in main_fn.body.statements if isinstance(s, ast.LetStmt)]
    assert len(lets) == 3


def test_parse_var_declarations():
    module = parse(lex(LOOPTEST.read_text(encoding="utf-8")))
    main_fn = module.functions[0]
    vars_ = [s for s in main_fn.body.statements if isinstance(s, ast.VarStmt)]
    assert len(vars_) == 2
    assert vars_[0].name == "i"
    assert vars_[0].type == ast.TypeKind.I32


def test_parse_set_statements():
    module = parse(lex(LOOPTEST.read_text(encoding="utf-8")))
    while_stmt = next(s for s in module.functions[0].body.statements if isinstance(s, ast.WhileStmt))
    sets = [s for s in while_stmt.body.statements if isinstance(s, ast.SetStmt)]
    assert len(sets) == 2
    assert sets[0].name == "total"
    assert isinstance(sets[0].value, ast.BinExpr)


def test_parse_while_condition():
    module = parse(lex(LOOPTEST.read_text(encoding="utf-8")))
    while_stmt = next(s for s in module.functions[0].body.statements if isinstance(s, ast.WhileStmt))
    assert isinstance(while_stmt.condition, ast.CmpExpr)
    assert while_stmt.condition.op == ast.CmpOp.LT


def test_parse_if_else_condition():
    module = parse(lex(CONDITION.read_text(encoding="utf-8")))
    if_stmt = next(s for s in module.functions[0].body.statements if isinstance(s, ast.IfStmt))
    assert isinstance(if_stmt.condition, ast.CmpExpr)
    assert if_stmt.condition.op == ast.CmpOp.EQ
    assert len(if_stmt.then_body.statements) == 1
    assert len(if_stmt.else_body.statements) == 1
