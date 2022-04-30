export type Program =
  { tag: "program", def: Array<Def>, stmt: Array<Stmt> }

export type Def =
    { tag: "defvar", name: Name, t: Type, value: Literal }
  | { tag: "defun", name: Name, params: Array<[Name, Type]>,
      body: Program, ret: Type }

export type Stmt =
    { tag: "define", name: Name, value: Expr }
  | { tag: "expr", expr: Expr }
  | { tag: "pass" }
  | { tag: "field-assign"; obj: Expr; field: string; value: Expr}
  | { tag: "return", expr: Expr }
  | { tag: "if", cond: Expr, yes: Array<Stmt>, no: Array<Stmt> }
  | { tag: "while", cond: Expr, body: Array<Stmt> }

export type Class = {
    a?: Type;
    name: string;
    fields: Array<Def>;
  };
// TODO: use specific type.
export type Literal =
  { a?: Type, tag: "none", val: string }
  | { a?: Type, tag: "bool", val: string }
  | { a?: Type, tag: "num", val: string }

export type Expr =
  Literal
  | { a?: Type, tag: "id", name: Name }
  | { a?: Type, tag: "app", fn: Name, args: Array<Expr> }
  | { a?: Type, tag: "binop", op: Bop, e1: Expr, e2: Expr }
  | { a?: Type, tag: "uniop", op: Uop, e: Expr }
  | { a?: Type, tag: "paren", e: Expr }
  | { a?: Type; tag: "lookup"; obj: Expr; field: string }
  | { a?: Type; tag: "construct"; name: string }

export type EnvVar =
  { tag: "global", a?: Type }
  | { tag: "local", a?: Type }
  | { tag: "param", a?: Type, idx: number }

export type Name = string
export type Type = | { tag: "int" }
| { tag: "bool" }
| { tag: "none" }
| { tag: "class"; name: String};
export type Uop = "-" | "not"
export type Bop = "+" | "-" | "*" | "//" | "%" | "==" | "!=" | "<=" | ">=" | "<" | ">" | "is"
export type Builtin = "print" | "abs" | "max" | "min" | "pow"
