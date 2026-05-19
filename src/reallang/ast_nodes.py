from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto


class TypeKind(Enum):
    I32 = auto()
    BOOL = auto()
    VOID = auto()
    STRING = auto()


class BinOp(Enum):
    ADD = auto()
    SUB = auto()
    MUL = auto()
    DIV = auto()


class CmpOp(Enum):
    LT = auto()
    LE = auto()
    GT = auto()
    GE = auto()
    EQ = auto()
    NE = auto()


@dataclass(frozen=True)
class Span:
    line: int
    column: int


@dataclass
class Module:
    name: str
    span: Span
    functions: list[Function]


@dataclass
class Param:
    name: str
    span: Span
    type: TypeKind


@dataclass
class Function:
    name: str
    span: Span
    params: list[Param]
    return_type: TypeKind
    body: Block


@dataclass
class Block:
    span: Span
    statements: list[Stmt]


class Stmt:
    pass


@dataclass
class LetStmt:
    span: Span
    name: str
    type: TypeKind
    init: Expr


@dataclass
class VarStmt:
    span: Span
    name: str
    type: TypeKind
    init: Expr


@dataclass
class SetStmt:
    span: Span
    name: str
    value: Expr


@dataclass
class WhileStmt:
    span: Span
    condition: Expr
    body: Block


@dataclass
class IfStmt:
    span: Span
    condition: Expr
    then_body: Block
    else_body: Block


@dataclass
class ExprStmt:
    span: Span
    expr: Expr


@dataclass
class ReturnStmt:
    span: Span
    value: Expr


class Expr:
    pass


@dataclass
class CmpExpr:
    span: Span
    op: CmpOp
    left: Expr
    right: Expr


@dataclass
class BinExpr:
    span: Span
    op: BinOp
    left: Expr
    right: Expr


@dataclass
class CallExpr:
    span: Span
    callee: str
    args: list[Expr]


@dataclass
class IdentExpr:
    span: Span
    name: str


@dataclass
class BoolLit:
    span: Span
    value: bool


@dataclass
class StringLit:
    span: Span
    value: str


@dataclass
class IntLit:
    span: Span
    value: int
