from __future__ import annotations

import re
from dataclasses import dataclass

from reallang import ast_nodes as ast
from reallang.diagnostics import type_error
from reallang.errors import TypeError as RealTypeError

BUILTINS: dict[str, tuple[list[ast.TypeKind], ast.TypeKind]] = {
    "print_str": ([ast.TypeKind.STRING], ast.TypeKind.VOID),
    "print_i32": ([ast.TypeKind.I32], ast.TypeKind.VOID),
    "print_bool": ([ast.TypeKind.BOOL], ast.TypeKind.VOID),
}

FunctionSig = tuple[list[ast.TypeKind], ast.TypeKind]

_I32_SOURCE_LITERAL_MIN = 0
_I32_SOURCE_LITERAL_MAX = 2**31 - 1

_C_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_C_RESERVED_IDENTIFIERS = {
    "auto",
    "break",
    "case",
    "char",
    "const",
    "continue",
    "default",
    "do",
    "double",
    "else",
    "enum",
    "extern",
    "float",
    "for",
    "goto",
    "if",
    "inline",
    "int",
    "long",
    "register",
    "restrict",
    "return",
    "short",
    "signed",
    "sizeof",
    "static",
    "struct",
    "switch",
    "typedef",
    "union",
    "unsigned",
    "void",
    "volatile",
    "while",
    "_Alignas",
    "_Alignof",
    "_Atomic",
    "_Bool",
    "_Complex",
    "_Generic",
    "_Imaginary",
    "_Noreturn",
    "_Static_assert",
    "_Thread_local",
}
_GENERATED_C_IDENTIFIERS = {
    "main",
    "bool",
    "false",
    "true",
    "int32_t",
    "uint32_t",
    "INT32_MIN",
    "PRId32",
    "UINT32_C",
    "printf",
    "memcpy",
    "real_i32_from_u32",
    "real_i32_add",
    "real_i32_sub",
    "real_i32_mul",
    "real_i32_div",
}
_C_DENIED_IDENTIFIERS = _C_RESERVED_IDENTIFIERS | _GENERATED_C_IDENTIFIERS


@dataclass
class Binding:
    type: ast.TypeKind
    mutable: bool
    decl_kind: str


def typecheck(module: ast.Module, *, file: str | None = None) -> ast.Module:
    if not module.functions:
        raise RealTypeError(
            type_error(
                "E210",
                "Module must define fn main().",
                file=file,
                line=module.span.line,
                column=module.span.column,
                repair="Add: fn main() -> i32 { return 0; }",
            )
        )

    functions: dict[str, FunctionSig] = {}
    for fn in module.functions:
        _check_c_identifier(fn.name, fn.span, "function", file=file, allow_main=True)
        if fn.name in functions:
            raise RealTypeError(
                type_error(
                    "E211",
                    f"Duplicate function {fn.name!r}.",
                    file=file,
                    line=fn.span.line,
                    column=fn.span.column,
                    repair="Rename or remove the duplicate function.",
                )
            )
        if fn.name == "main":
            if fn.params:
                raise RealTypeError(
                    type_error(
                        "E217",
                        "fn main() must not declare parameters.",
                        file=file,
                        line=fn.params[0].span.line,
                        column=fn.params[0].span.column,
                        expected="fn main() -> i32",
                        found=f"{len(fn.params)} parameter(s)",
                        repair="Remove parameters from main.",
                    )
                )
            if fn.return_type != ast.TypeKind.I32:
                raise RealTypeError(
                    type_error(
                        "E216",
                        "fn main() must return i32.",
                        file=file,
                        line=fn.span.line,
                        column=fn.span.column,
                        expected="i32",
                        found=fn.return_type.name,
                        repair="Change the return type to i32.",
                    )
                )
        if fn.return_type not in (ast.TypeKind.I32, ast.TypeKind.BOOL):
            raise RealTypeError(
                type_error(
                    "E200",
                    f"Function {fn.name!r} has unsupported return type.",
                    file=file,
                    line=fn.span.line,
                    column=fn.span.column,
                    expected="i32 or bool",
                    found=fn.return_type.name,
                )
            )
        seen_params: set[str] = set()
        for param in fn.params:
            _check_c_identifier(param.name, param.span, "parameter", file=file)
            if param.name in seen_params:
                raise RealTypeError(
                    type_error(
                        "E218",
                        f"Duplicate parameter {param.name!r}.",
                        file=file,
                        line=param.span.line,
                        column=param.span.column,
                        why="A function parameter name may only be declared once.",
                        repair="Rename or remove the duplicate parameter.",
                    )
                )
            seen_params.add(param.name)
            if param.type not in (ast.TypeKind.I32, ast.TypeKind.BOOL):
                raise RealTypeError(
                    type_error(
                        "E200",
                        f"Parameter {param.name!r} has unsupported type.",
                        file=file,
                        line=param.span.line,
                        column=param.span.column,
                        expected="i32 or bool",
                        found=param.type.name,
                    )
                )
        functions[fn.name] = ([p.type for p in fn.params], fn.return_type)

    for fn in module.functions:
        _check_function(fn, functions, file=file)

    mains = [f for f in module.functions if f.name == "main"]
    if len(mains) != 1:
        raise RealTypeError(
            type_error(
                "E210",
                "Module must define exactly one fn main().",
                file=file,
                line=module.span.line,
                column=module.span.column,
                found=f"{len(mains)} main function(s)",
                repair="Add exactly one: fn main() -> i32 { ... }",
            )
        )

    return module


def _check_function(fn: ast.Function, functions: dict[str, FunctionSig], *, file: str | None) -> None:
    env: dict[str, Binding] = {
        p.name: Binding(type=p.type, mutable=False, decl_kind="parameter") for p in fn.params
    }
    for stmt in fn.body.statements:
        _check_statement(stmt, fn.return_type, env, functions, file=file)
    if not _block_guarantees_return(fn.body.statements):
        raise RealTypeError(
            type_error(
                "E220",
                f"Function {fn.name!r} must return {fn.return_type.name} on every path.",
                file=file,
                line=fn.span.line,
                column=fn.span.column,
                why=(
                    "RealLang v0.1 only treats a direct return statement, or an "
                    "if/else where both branches return, as guaranteeing a return. "
                    "while loops do not guarantee a return."
                ),
                expected="return on every control-flow path",
                repair="Add a return statement after control flow or return from every branch.",
            )
        )


def _check_statement(
    stmt: ast.Stmt,
    expected_return: ast.TypeKind,
    env: dict[str, Binding],
    functions: dict[str, FunctionSig],
    *,
    file: str | None,
) -> None:
    if isinstance(stmt, ast.LetStmt):
        _check_c_identifier(stmt.name, stmt.span, "binding", file=file)
        init_type = _check_expr(stmt.init, env, functions, file=file)
        if init_type != stmt.type:
            raise RealTypeError(
                type_error(
                    "E212",
                    f"let {stmt.name!r} initializer type does not match annotation.",
                    file=file,
                    line=stmt.span.line,
                    column=stmt.span.column,
                    expected=stmt.type.name,
                    found=init_type.name,
                    repair=f"Change the initializer to produce {stmt.type.name}, or change the annotation.",
                )
            )
        if stmt.name in env:
            raise RealTypeError(
                type_error(
                    "E202",
                    f"Redeclared binding {stmt.name!r}.",
                    file=file,
                    line=stmt.span.line,
                    column=stmt.span.column,
                    why=f"'{stmt.name}' is already in scope in this function.",
                    repair="Rename the binding or remove the earlier declaration.",
                )
            )
        env[stmt.name] = Binding(type=stmt.type, mutable=False, decl_kind="let")
        return

    if isinstance(stmt, ast.VarStmt):
        _check_c_identifier(stmt.name, stmt.span, "binding", file=file)
        init_type = _check_expr(stmt.init, env, functions, file=file)
        if init_type != stmt.type:
            raise RealTypeError(
                type_error(
                    "E212",
                    f"var {stmt.name!r} initializer type does not match annotation.",
                    file=file,
                    line=stmt.span.line,
                    column=stmt.span.column,
                    expected=stmt.type.name,
                    found=init_type.name,
                    repair=f"Change the initializer to produce {stmt.type.name}, or change the annotation.",
                )
            )
        if stmt.name in env:
            raise RealTypeError(
                type_error(
                    "E202",
                    f"Redeclared binding {stmt.name!r}.",
                    file=file,
                    line=stmt.span.line,
                    column=stmt.span.column,
                    repair="Rename the binding or remove the earlier declaration.",
                )
            )
        env[stmt.name] = Binding(type=stmt.type, mutable=True, decl_kind="var")
        return

    if isinstance(stmt, ast.SetStmt):
        if stmt.name not in env:
            raise RealTypeError(
                type_error(
                    "E201",
                    f"Unknown variable {stmt.name!r}.",
                    file=file,
                    line=stmt.span.line,
                    column=stmt.span.column,
                    repair=f"Declare {stmt.name} with let or var before assigning to it.",
                )
            )
        binding = env[stmt.name]
        if not binding.mutable:
            raise RealTypeError(
                type_error(
                    "E203",
                    f"Cannot assign to immutable binding {stmt.name!r}.",
                    file=file,
                    line=stmt.span.line,
                    column=stmt.span.column,
                    why=f"'{stmt.name}' was declared with let, which creates an immutable binding.",
                    repair=(
                        f"Change:\n  let {stmt.name}: {binding.type.name} = ...;\n"
                        f"To:\n  var {stmt.name}: {binding.type.name} = ...;\n"
                        "Or remove this set statement."
                    ),
                )
            )
        value_type = _check_expr(stmt.value, env, functions, file=file)
        if value_type != binding.type:
            raise RealTypeError(
                type_error(
                    "E204",
                    f"set {stmt.name!r} type mismatch.",
                    file=file,
                    line=stmt.span.line,
                    column=stmt.span.column,
                    expected=binding.type.name,
                    found=value_type.name,
                    repair=f"Assign a {binding.type.name} expression to {stmt.name}.",
                )
            )
        return

    if isinstance(stmt, ast.WhileStmt):
        cond_type = _check_expr(stmt.condition, env, functions, file=file)
        if cond_type != ast.TypeKind.BOOL:
            raise RealTypeError(
                type_error(
                    "E208",
                    "while condition must be bool.",
                    file=file,
                    line=stmt.span.line,
                    column=stmt.span.column,
                    expected="bool",
                    found=cond_type.name,
                    repair="Use a comparison or bool expression inside condition(...).",
                )
            )
        body_env = env.copy()
        for inner in stmt.body.statements:
            _check_statement(inner, expected_return, body_env, functions, file=file)
        return

    if isinstance(stmt, ast.IfStmt):
        cond_type = _check_expr(stmt.condition, env, functions, file=file)
        if cond_type != ast.TypeKind.BOOL:
            raise RealTypeError(
                type_error(
                    "E207",
                    "if condition must be bool.",
                    file=file,
                    line=stmt.span.line,
                    column=stmt.span.column,
                    expected="bool",
                    found=cond_type.name,
                    repair="Use a comparison or bool expression inside condition(...).",
                )
            )
        then_env = env.copy()
        for inner in stmt.then_body.statements:
            _check_statement(inner, expected_return, then_env, functions, file=file)
        else_env = env.copy()
        for inner in stmt.else_body.statements:
            _check_statement(inner, expected_return, else_env, functions, file=file)
        return

    if isinstance(stmt, ast.ExprStmt):
        kind = _check_expr(stmt.expr, env, functions, file=file)
        if kind != ast.TypeKind.VOID:
            raise RealTypeError(
                type_error(
                    "E200",
                    "Expression statement must have void type.",
                    file=file,
                    line=stmt.span.line,
                    column=stmt.span.column,
                    expected="void",
                    found=kind.name,
                )
            )
        return

    if isinstance(stmt, ast.ReturnStmt):
        value_type = _check_expr(stmt.value, env, functions, file=file)
        if value_type != expected_return:
            raise RealTypeError(
                type_error(
                    "E209",
                    "Return type mismatch.",
                    file=file,
                    line=stmt.span.line,
                    column=stmt.span.column,
                    expected=expected_return.name,
                    found=value_type.name,
                    repair=f"Return a {expected_return.name} expression from this function.",
                )
            )
        return

    raise RealTypeError(
        type_error(
            "E200",
            f"Unsupported statement: {type(stmt).__name__}.",
            file=file,
            line=getattr(stmt, "span", ast.Span(0, 0)).line,
            column=getattr(stmt, "span", ast.Span(0, 0)).column,
        )
    )


def _check_expr(
    expr: ast.Expr,
    env: dict[str, Binding],
    functions: dict[str, FunctionSig],
    *,
    file: str | None,
) -> ast.TypeKind:
    if isinstance(expr, ast.IntLit):
        _check_i32_literal(expr, file=file)
        return ast.TypeKind.I32
    if isinstance(expr, ast.BoolLit):
        return ast.TypeKind.BOOL
    if isinstance(expr, ast.StringLit):
        return ast.TypeKind.STRING
    if isinstance(expr, ast.IdentExpr):
        if expr.name not in env:
            raise RealTypeError(
                type_error(
                    "E201",
                    f"Unknown variable {expr.name!r}.",
                    file=file,
                    line=expr.span.line,
                    column=expr.span.column,
                    repair=f"Declare {expr.name} with let or var before use.",
                )
            )
        return env[expr.name].type
    if isinstance(expr, ast.BinExpr):
        return _check_bin(expr, env, functions, file=file)
    if isinstance(expr, ast.CmpExpr):
        return _check_cmp(expr, env, functions, file=file)
    if isinstance(expr, ast.CallExpr):
        return _check_call(expr, env, functions, file=file)
    raise RealTypeError(
        type_error(
            "E200",
            f"Unsupported expression: {type(expr).__name__}.",
            file=file,
            line=expr.span.line,
            column=expr.span.column,
        )
    )


def _check_bin(
    expr: ast.BinExpr,
    env: dict[str, Binding],
    functions: dict[str, FunctionSig],
    *,
    file: str | None,
) -> ast.TypeKind:
    left = _check_expr(expr.left, env, functions, file=file)
    right = _check_expr(expr.right, env, functions, file=file)
    if left != ast.TypeKind.I32 or right != ast.TypeKind.I32:
        raise RealTypeError(
            type_error(
                "E214",
                "Arithmetic operands must be i32.",
                file=file,
                line=expr.span.line,
                column=expr.span.column,
                expected="i32 on both sides",
                found=f"{left.name} and {right.name}",
            )
        )
    return ast.TypeKind.I32


def _check_cmp(
    expr: ast.CmpExpr,
    env: dict[str, Binding],
    functions: dict[str, FunctionSig],
    *,
    file: str | None,
) -> ast.TypeKind:
    left = _check_expr(expr.left, env, functions, file=file)
    right = _check_expr(expr.right, env, functions, file=file)
    if left != right:
        raise RealTypeError(
            type_error(
                "E215",
                "Comparison operands must have the same type.",
                file=file,
                line=expr.span.line,
                column=expr.span.column,
                found=f"{left.name} and {right.name}",
            )
        )
    if left not in (ast.TypeKind.I32, ast.TypeKind.BOOL):
        raise RealTypeError(
            type_error(
                "E215",
                "Comparison operands must be i32 or bool.",
                file=file,
                line=expr.span.line,
                column=expr.span.column,
                expected="i32 or bool",
                found=left.name,
            )
        )
    return ast.TypeKind.BOOL


def _check_call(
    call: ast.CallExpr,
    env: dict[str, Binding],
    functions: dict[str, FunctionSig],
    *,
    file: str | None,
) -> ast.TypeKind:
    if call.callee in BUILTINS:
        param_types, ret_type = BUILTINS[call.callee]
    elif call.callee in functions:
        param_types, ret_type = functions[call.callee]
    else:
        raise RealTypeError(
            type_error(
                "E213",
                f"Unknown function {call.callee!r}.",
                file=file,
                line=call.span.line,
                column=call.span.column,
                repair="Define the function in this module or use a supported builtin.",
            )
        )

    if len(call.args) != len(param_types):
        raise RealTypeError(
            type_error(
                "E205",
                f"{call.callee} called with wrong number of arguments.",
                file=file,
                line=call.span.line,
                column=call.span.column,
                expected=f"{len(param_types)} argument(s)",
                found=f"{len(call.args)} argument(s)",
                repair=f"Pass exactly {len(param_types)} argument(s) to {call.callee}.",
            )
        )

    for arg, expected in zip(call.args, param_types, strict=True):
        arg_type = _check_expr(arg, env, functions, file=file)
        if arg_type != expected:
            raise RealTypeError(
                type_error(
                    "E206",
                    f"{call.callee} argument type mismatch.",
                    file=file,
                    line=call.span.line,
                    column=call.span.column,
                    expected=expected.name,
                    found=arg_type.name,
                    repair=f"Pass {expected.name} to match the {call.callee} parameter type.",
                )
            )

    return ret_type


def _check_i32_literal(expr: ast.IntLit, *, file: str | None) -> None:
    if _I32_SOURCE_LITERAL_MIN <= expr.value <= _I32_SOURCE_LITERAL_MAX:
        return
    raise RealTypeError(
        type_error(
            "E221",
            f"Integer literal {expr.value} is outside the RealLang i32 source literal range.",
            file=file,
            line=expr.span.line,
            column=expr.span.column,
            why=(
                "RealLang v0.1 integer literals are non-negative decimal source "
                "tokens. There is no unary minus syntax yet, so -2147483648 is "
                "not accepted as a direct source literal."
            ),
            expected=f"{_I32_SOURCE_LITERAL_MIN}..{_I32_SOURCE_LITERAL_MAX}",
            found=str(expr.value),
            repair=(
                "Use a literal between 0 and 2147483647, or express negative or "
                "wrapping values with supported i32 arithmetic."
            ),
        )
    )


def _check_c_identifier(
    name: str,
    span: ast.Span,
    subject: str,
    *,
    file: str | None,
    allow_main: bool = False,
) -> None:
    if allow_main and name == "main":
        return
    c_reserved_prefix = name.startswith("__") or (
        len(name) > 1 and name[0] == "_" and name[1].isupper()
    )
    if (
        not _C_IDENTIFIER_RE.match(name)
        or name in _C_DENIED_IDENTIFIERS
        or c_reserved_prefix
    ):
        raise RealTypeError(
            type_error(
                "E219",
                f"{subject.capitalize()} name {name!r} cannot be emitted safely to C.",
                file=file,
                line=span.line,
                column=span.column,
                why=(
                    "RealLang v0.1 emits C directly, so user identifiers must be "
                    "portable C identifiers and must not collide with C keywords, "
                    "standard library names, or generated runtime helper names."
                ),
                repair="Rename the identifier to a simple project-local name such as value, count, or helper.",
            )
        )


def _block_guarantees_return(statements: list[ast.Stmt]) -> bool:
    for stmt in statements:
        if isinstance(stmt, ast.ReturnStmt):
            return True
        if isinstance(stmt, ast.IfStmt) and _block_guarantees_return(
            stmt.then_body.statements
        ) and _block_guarantees_return(stmt.else_body.statements):
            return True
    return False
