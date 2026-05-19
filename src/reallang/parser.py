from __future__ import annotations

from reallang import ast_nodes as ast
from reallang.diagnostics import parse_error
from reallang.errors import ParseError
from reallang.lexer import Token, TokenKind

_TOKEN_LABELS: dict[TokenKind, str] = {
    TokenKind.SEMICOLON: "';'",
    TokenKind.RPAREN: "')'",
    TokenKind.RBRACE: "'}'",
    TokenKind.LPAREN: "'('",
    TokenKind.LBRACE: "'{'",
    TokenKind.INT: "integer literal",
    TokenKind.IDENT: "identifier",
    TokenKind.EOF: "end of file",
}


class Parser:
    def __init__(self, tokens: list[Token], *, file: str | None = None) -> None:
        self._tokens = tokens
        self._index = 0
        self._file = file

    def parse_module(self) -> ast.Module:
        start = self._current_span()
        self._expect(TokenKind.MODULE, "expected 'module'")
        name_tok = self._expect(TokenKind.IDENT, "expected module name")
        self._expect(TokenKind.SEMICOLON, "expected ';' after module name")

        functions: list[ast.Function] = []
        while not self._check(TokenKind.EOF):
            functions.append(self._parse_function())

        self._expect(TokenKind.EOF, "expected end of file")
        return ast.Module(name=name_tok.lexeme, span=start, functions=functions)

    def _parse_function(self) -> ast.Function:
        start = self._current_span()
        self._expect(TokenKind.FN, "expected 'fn'")
        name_tok = self._expect(TokenKind.IDENT, "expected function name")
        self._expect(TokenKind.LPAREN, "expected '('")
        params = self._parse_params()
        self._expect(TokenKind.RPAREN, "expected ')'")
        self._expect(TokenKind.ARROW, "expected '->'")
        ret = self._parse_type()
        body = self._parse_block()
        return ast.Function(
            name=name_tok.lexeme,
            span=start,
            params=params,
            return_type=ret,
            body=body,
        )

    def _parse_params(self) -> list[ast.Param]:
        params: list[ast.Param] = []
        if self._check(TokenKind.RPAREN):
            return params
        while True:
            params.append(self._parse_param())
            if not self._match(TokenKind.COMMA):
                break
        return params

    def _parse_param(self) -> ast.Param:
        start = self._current_span()
        name_tok = self._expect(TokenKind.IDENT, "expected parameter name")
        self._expect(TokenKind.COLON, "expected ':' after parameter name")
        ty = self._parse_type()
        return ast.Param(name=name_tok.lexeme, span=start, type=ty)

    def _parse_type(self) -> ast.TypeKind:
        tok = self._advance()
        if tok.kind == TokenKind.I32:
            return ast.TypeKind.I32
        if tok.kind == TokenKind.BOOL:
            return ast.TypeKind.BOOL
        raise ParseError(
            parse_error(
                "E105",
                "Expected a type name.",
                file=self._file,
                line=tok.line,
                column=tok.column,
                expected="i32 or bool",
                found=tok.lexeme,
            )
        )

    def _parse_block(self) -> ast.Block:
        start = self._current_span()
        self._expect(TokenKind.LBRACE, "expected '{'")
        statements: list[ast.Stmt] = []
        while not self._check(TokenKind.RBRACE):
            if self._check(TokenKind.EOF):
                tok = self._peek()
                raise ParseError(
                    self._missing_token_diagnostic(TokenKind.RBRACE, "'}'", tok)
                )
            statements.append(self._parse_statement())
        self._expect(TokenKind.RBRACE, "expected '}'")
        return ast.Block(span=start, statements=statements)

    def _parse_statement(self) -> ast.Stmt:
        if self._check(TokenKind.RETURN):
            return self._parse_return()
        if self._check(TokenKind.LET):
            return self._parse_let()
        if self._check(TokenKind.VAR):
            return self._parse_var()
        if self._check(TokenKind.SET):
            return self._parse_set()
        if self._check(TokenKind.WHILE):
            return self._parse_while()
        if self._check(TokenKind.IF):
            return self._parse_if()
        start = self._current_span()
        expr = self._parse_expr()
        self._expect(TokenKind.SEMICOLON, "expected ';' after expression")
        return ast.ExprStmt(span=start, expr=expr)

    def _parse_let(self) -> ast.LetStmt:
        start = self._current_span()
        self._expect(TokenKind.LET, "expected 'let'")
        name_tok = self._expect(TokenKind.IDENT, "expected binding name")
        self._expect(TokenKind.COLON, "expected ':' after binding name")
        ty = self._parse_type()
        self._expect(TokenKind.EQ, "expected '='")
        init = self._parse_expr()
        self._expect(TokenKind.SEMICOLON, "expected ';' after let initializer")
        return ast.LetStmt(span=start, name=name_tok.lexeme, type=ty, init=init)

    def _parse_var(self) -> ast.VarStmt:
        start = self._current_span()
        self._expect(TokenKind.VAR, "expected 'var'")
        name_tok = self._expect(TokenKind.IDENT, "expected binding name")
        self._expect(TokenKind.COLON, "expected ':' after binding name")
        ty = self._parse_type()
        self._expect(TokenKind.EQ, "expected '='")
        init = self._parse_expr()
        self._expect(TokenKind.SEMICOLON, "expected ';' after var initializer")
        return ast.VarStmt(span=start, name=name_tok.lexeme, type=ty, init=init)

    def _parse_set(self) -> ast.SetStmt:
        start = self._current_span()
        self._expect(TokenKind.SET, "expected 'set'")
        name_tok = self._expect(TokenKind.IDENT, "expected variable name")
        self._expect(TokenKind.EQ, "expected '='")
        value = self._parse_expr()
        self._expect(TokenKind.SEMICOLON, "expected ';' after set value")
        return ast.SetStmt(span=start, name=name_tok.lexeme, value=value)

    def _parse_while(self) -> ast.WhileStmt:
        start = self._current_span()
        self._expect(TokenKind.WHILE, "expected 'while'")
        cond = self._parse_condition_expr()
        body = self._parse_block()
        return ast.WhileStmt(span=start, condition=cond, body=body)

    def _parse_if(self) -> ast.IfStmt:
        start = self._current_span()
        self._expect(TokenKind.IF, "expected 'if'")
        cond = self._parse_condition_expr()
        then_body = self._parse_block()
        self._expect(TokenKind.ELSE, "expected 'else'")
        else_body = self._parse_block()
        return ast.IfStmt(span=start, condition=cond, then_body=then_body, else_body=else_body)

    def _parse_condition_expr(self) -> ast.Expr:
        self._expect(TokenKind.CONDITION, "expected 'condition'")
        self._expect(TokenKind.LPAREN, "expected '(' after condition")
        expr = self._parse_expr()
        self._expect(TokenKind.RPAREN, "expected ')' after condition expression")
        return expr

    def _parse_return(self) -> ast.ReturnStmt:
        start = self._current_span()
        self._expect(TokenKind.RETURN, "expected 'return'")
        value = self._parse_expr()
        self._expect(TokenKind.SEMICOLON, "expected ';' after return value")
        return ast.ReturnStmt(span=start, value=value)

    def _parse_expr(self) -> ast.Expr:
        return self._parse_comparison()

    def _parse_comparison(self) -> ast.Expr:
        left = self._parse_additive()
        cmp_map = {
            TokenKind.LT: ast.CmpOp.LT,
            TokenKind.LE: ast.CmpOp.LE,
            TokenKind.GT: ast.CmpOp.GT,
            TokenKind.GE: ast.CmpOp.GE,
            TokenKind.EQEQ: ast.CmpOp.EQ,
            TokenKind.NE: ast.CmpOp.NE,
        }
        for kind, op in cmp_map.items():
            if self._match(kind):
                right = self._parse_additive()
                return ast.CmpExpr(span=self._expr_span(left), op=op, left=left, right=right)
        return left

    def _parse_additive(self) -> ast.Expr:
        left = self._parse_multiplicative()
        while True:
            if self._match(TokenKind.PLUS):
                op = ast.BinOp.ADD
            elif self._match(TokenKind.MINUS):
                op = ast.BinOp.SUB
            else:
                break
            right = self._parse_multiplicative()
            left = ast.BinExpr(span=self._expr_span(left), op=op, left=left, right=right)
        return left

    def _parse_multiplicative(self) -> ast.Expr:
        left = self._parse_primary()
        while True:
            if self._match(TokenKind.STAR):
                op = ast.BinOp.MUL
            elif self._match(TokenKind.SLASH):
                op = ast.BinOp.DIV
            else:
                break
            right = self._parse_primary()
            left = ast.BinExpr(span=self._expr_span(left), op=op, left=left, right=right)
        return left

    def _parse_primary(self) -> ast.Expr:
        tok = self._peek()
        if tok.kind == TokenKind.INT:
            return self._parse_int_lit()
        if tok.kind == TokenKind.TRUE:
            self._advance()
            return ast.BoolLit(span=self._span(tok), value=True)
        if tok.kind == TokenKind.FALSE:
            self._advance()
            return ast.BoolLit(span=self._span(tok), value=False)
        if tok.kind == TokenKind.STRING:
            self._advance()
            return ast.StringLit(span=self._span(tok), value=tok.lexeme)
        if tok.kind == TokenKind.IDENT:
            name = tok.lexeme
            self._advance()
            if self._match(TokenKind.LPAREN):
                return self._parse_call_rest(name, tok)
            return ast.IdentExpr(span=self._span(tok), name=name)
        if self._match(TokenKind.LPAREN):
            expr = self._parse_expr()
            self._expect(TokenKind.RPAREN, "expected ')'")
            return expr
        found = _TOKEN_LABELS.get(tok.kind, repr(tok.lexeme))
        raise ParseError(
            parse_error(
                "E104",
                "Expected an expression.",
                file=self._file,
                line=tok.line,
                column=tok.column,
                expected="integer, bool, string, identifier, or '(' expression ')'",
                found=found,
            )
        )

    def _parse_call_rest(self, callee: str, start_tok: Token) -> ast.CallExpr:
        args: list[ast.Expr] = []
        if not self._check(TokenKind.RPAREN):
            args.append(self._parse_expr())
            while self._match(TokenKind.COMMA):
                args.append(self._parse_expr())
        self._expect(TokenKind.RPAREN, "expected ')'")
        return ast.CallExpr(span=self._span(start_tok), callee=callee, args=args)

    def _parse_int_lit(self) -> ast.IntLit:
        tok = self._expect(TokenKind.INT, "expected integer literal")
        return ast.IntLit(span=self._span(tok), value=int(tok.lexeme))

    def _expect(self, kind: TokenKind, expected_label: str) -> Token:
        if self._check(kind):
            return self._advance()
        tok = self._peek()
        raise ParseError(self._missing_token_diagnostic(kind, expected_label, tok))

    def _missing_token_diagnostic(
        self, expected: TokenKind, expected_label: str, found: Token
    ):
        found_label = _TOKEN_LABELS.get(found.kind, repr(found.lexeme))
        if expected == TokenKind.SEMICOLON:
            return parse_error(
                "E101",
                "Expected ';' at the end of the statement.",
                file=self._file,
                line=found.line,
                column=found.column,
                expected="';'",
                found=found_label,
                repair="Add ';' after the statement.",
            )
        if expected == TokenKind.RPAREN:
            return parse_error(
                "E102",
                "Expected ')' to close the list or expression.",
                file=self._file,
                line=found.line,
                column=found.column,
                expected="')'",
                found=found_label,
                repair="Add ')' before continuing.",
            )
        if expected == TokenKind.RBRACE:
            return parse_error(
                "E103",
                "Expected '}' to close the block.",
                file=self._file,
                line=found.line,
                column=found.column,
                expected="'}'",
                found=found_label,
                repair="Add '}' to close the block.",
            )
        return parse_error(
            "E100",
            f"Expected {expected_label}.",
            file=self._file,
            line=found.line,
            column=found.column,
            expected=expected_label,
            found=found_label,
        )

    def _match(self, kind: TokenKind) -> bool:
        if self._check(kind):
            self._advance()
            return True
        return False

    def _check(self, kind: TokenKind) -> bool:
        return self._peek().kind == kind

    def _advance(self) -> Token:
        tok = self._peek()
        if tok.kind != TokenKind.EOF:
            self._index += 1
        return tok

    def _peek(self) -> Token:
        return self._tokens[self._index]

    def _current_span(self) -> ast.Span:
        tok = self._peek()
        return ast.Span(line=tok.line, column=tok.column)

    @staticmethod
    def _span(tok: Token) -> ast.Span:
        return ast.Span(line=tok.line, column=tok.column)

    @staticmethod
    def _expr_span(expr: ast.Expr) -> ast.Span:
        return expr.span


def parse(tokens: list[Token], *, file: str | None = None) -> ast.Module:
    return Parser(tokens, file=file).parse_module()
