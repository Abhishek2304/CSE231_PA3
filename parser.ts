import {parser} from "lezer-python";
import {TreeCursor} from "lezer-tree";
import {Expr, Stmt, Def, Program, Name, Type, Literal, Class} from "./ast";

export class ParseError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "ParseError";
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

export function assertUnreachable(a: never) {
  throw Error(`Shouldn't be here: ${a}`);
}

function throwParseErr(cursor: TreeCursor, source: string, msg: string = "") {
  throw new ParseError(`Could not parse ${cursor.from}–${cursor.to}: "${source.substring(cursor.from, cursor.to)}", ${msg}`);
}

export function next(c: TreeCursor, s: string) {
  if (!c.nextSibling()) {
    throwParseErr(c, s, `Missing token`);
  }
}

export function nextAssert(c: TreeCursor, s: string, t: string) {
  next(c, s);
  typeAssert(c, s, t);
}

export function typeAssert(c: TreeCursor, s: string,  t: string) {
  if (c.node.type.name as string !== t) {
    throwParseErr(c, s, `Expecting ${t}, encountered ${c.node.type.name}`);
  }
}

export function checkTrailing(c: TreeCursor, s: string) {
  if (c.nextSibling()) {
    throwParseErr(c, s, "Trailing expression");
  }
}

export function traverseExpr(c : TreeCursor, s : string) : Expr {
  switch(c.type.name) {

    case "Boolean": {
        let val = s.substring(c.from, c.to);
        if (val === "True") {
          return { a: {tag: "bool"}, tag: "bool", val: "1" };
        } else if (val === "False") {
          return { a: {tag: "bool"}, tag: "bool", val: "0" };
        } else {
          throwParseErr(c, s, "Unrecognized boolean")
        }
      }

    case "Number":
      return { a: {tag: "int"}, tag: "num", val: s.substring(c.from, c.to) };

    case "None":
      return { a: {tag: "none"}, tag: "none", val: "0" };

    case "VariableName":
      return { tag: "id", name: s.substring(c.from, c.to) };

    case "CallExpression": {
      c.firstChild(); // Function name.
      const callName = s.substring(c.from, c.to);
      nextAssert(c, s, "ArgList");
      let args = traverseArgs(c, s);
      checkTrailing(c, s);
      c.parent();
      return {
        tag: "app",
        fn: callName,
        args: args
      }
    }

    case "BinaryExpression": {
      // First expression.
      c.firstChild();
      const exp1 = traverseExpr(c, s);
      // Op.
      next(c, s); // op
      const bop = s.substring(c.from, c.to);
      // Second expression.
      next(c, s);
      const exp2 = traverseExpr(c, s);
      // Done.
      checkTrailing(c, s);
      c.parent()
      console.log(bop);
      if (bop === "+" || bop === "-" || bop === "*" || bop === "//"
        || bop === "%" || bop === "==" || bop === "!=" || bop === "<="
        || bop === ">=" || bop === "<" || bop === ">" || bop === "is") {
        return {
          tag: "binop",
          op: bop,
          e1: exp1,
          e2: exp2
        };
      } else {
        throwParseErr(c, s, `${bop} is not supported`);
      }
    }

    case "UnaryExpression": {
      c.firstChild(); // Op.
      const uop = s.substring(c.from, c.to);
      next(c, s); // Expr
      let expr = traverseExpr(c, s);
      checkTrailing(c, s);
      c.parent();
      switch (uop) {
        case "-":
        case "not":
          return {
            tag: "uniop",
            op: uop,
            e: expr
          };
        default:
          throwParseErr(c, s, "Unsupported operator")
      }
    }

    case "ParenthesizedExpression": {
      c.firstChild(); // "(".
      next(c, s); // Expression.
      let expr = traverseExpr(c, s);
      nextAssert(c, s, ")");
      checkTrailing(c, s);
      c.parent();
      return { tag: "paren", e: expr };
    }

    default:
      throwParseErr(c, s, `type: ${c.type.name}`);
  }
}

export function traverseArgs(c: TreeCursor, s: string): Array<Expr> {
  c.firstChild(); // Focus on “(”.
  typeAssert(c, s, "(")
  next(c, s); // First arg.
  let args = [];
  while (c.type.name !== ")") {
    args.push(traverseExpr(c, s));
    next(c, s); // "," or ")"
    switch (c.node.type.name as string) {
      case ",":
        next(c, s); // Next arg or “)”.
        continue;
      case ")":
        break;
      default:
        throwParseErr(c, s, "Unexpected token");
    }
  }
  checkTrailing(c, s);
  c.parent();
  return args;
}

function traverseTypeDef(c: TreeCursor, s: string, hasPrefix: boolean = true): Type {
  c.firstChild(); // ":" or type, depending on hasPrefix.
  if (hasPrefix) {
    nextAssert(c, s, "VariableName"); // Type.
  } else {
    typeAssert(c, s, "VariableName"); // Type.
  }

  let t = s.substring(c.from, c.to);
  if (t === "int" || t === "bool") {
    checkTrailing(c, s);
    c.parent();
    return {tag: t};
  } else {
    throwParseErr(c, s, "Unsupported type");
  }
}

export function traverseParams(c: TreeCursor, s: string): Array<[Name, Type]> {
  c.firstChild(); // "(".
  let result = [];
  c.nextSibling(); // ")" or arg.
  while (c.node.type.name !== ")") {
    let arg = s.substring(c.from, c.to);
    nextAssert(c, s, "TypeDef");
    let t = traverseTypeDef(c, s);
    result.push([arg, t]);
    // "," or ")"
    if (!c.nextSibling()) {
      break;
    }
    if (c.node.type.name === ",") {
      nextAssert(c, s, "VariableName"); // Next arg.
    }
  }
  checkTrailing(c, s);
  c.parent();
  return result as Array<[Name, Type]>;
}

export function peekDefP(c: TreeCursor, s: string): "defvar" | "defun" | "stmt" | "class"{
  switch (c.node.type.name) {
    case "ClassDefinition":{
      return "class";
    }
    case "AssignStatement": {
      c.firstChild(); // Name
      next(c, s); // “=” or type.
      // console.log(`type: ${c.node.type.name}`)
      if (c.node.type.name as string === "TypeDef") {
        c.parent();
        return "defvar"
      } else {
        c.parent();
        return "stmt";
      }
    }
    case "FunctionDefinition": {
      return "defun";
    }
    default:
      return "stmt";
  }
}

export function traverseDef(c: TreeCursor, s: string): Def {
  switch (c.node.type.name) {
    case "AssignStatement": {
      // Variable.
      c.firstChild();
      const name = s.substring(c.from, c.to);
      next(c, s); // “=” or type.
      let t = "";
      if (c.node.type.name as string === "TypeDef") {
        t = traverseTypeDef(c, s).tag;
      } else {
        throwParseErr(c, s, "Missing type declaration");
      }
      console.log(`name: ${name}, type: ${t}, c: ${c}`)
      nextAssert(c, s, "AssignOp");
      // Value.
      next(c, s);
      const value = traverseExpr(c, s);
      checkTrailing(c, s)
      c.parent();
      if (t === "int" || t === "bool" || t === "none") {
        if (value.tag === "num" || value.tag === "bool" || value.tag === "none") {
          return {
            tag: "defvar",
            name: name,
            t: {tag: t},
            value: value
          };
        } else {
          throwParseErr(c, s, "Declaration has to be literal")
        }
      } else {
        throwParseErr(c, s, "Unsupported type");
      }
    }

    case "FunctionDefinition": {
      c.firstChild(); // "def".
      nextAssert(c, s, "VariableName"); // Fn name.
      let fnName = s.substring(c.from, c.to);
      nextAssert(c,s, "ParamList");
      let params = traverseParams(c, s);
      next(c, s);
      let ret = {tag: "none"} as Type;
      if (c.node.type.name as string === "TypeDef") {
        ret = traverseTypeDef(c, s, false);
        next(c, s);
      }
      typeAssert(c, s, "Body");
      let body = traverseBody(c, s, true);
      checkTrailing(c, s);
      c.parent();
      return { tag: "defun", name: fnName, params, body, ret };
    }
  }
}

export function traverseStmt(c: TreeCursor, s: string): Stmt {
  switch(c.node.type.name) {

    case "AssignStatement": {
      // Variable.
      c.firstChild();
      const name = s.substring(c.from, c.to);
      nextAssert(c, s, "AssignOp");
      // Value.
      next(c, s);
      const value = traverseExpr(c, s);
      checkTrailing(c, s)
      c.parent();
      return {
        tag: "define",
        name: name,
        value: value
      };
    }

    case "PassStatement":
      return { tag: "pass" };

    case "ReturnStatement": {
      c.firstChild(); // "return".
      const none = { tag: "none", a: {tag: "none"}, val: "0" } as Literal;
      let ret = { tag: "return", expr: none } as Stmt;
      if (c.nextSibling() && c.from !== c.to) {
        let expr = traverseExpr(c, s);
        ret = { tag: "return", expr };
      }
      checkTrailing(c, s);
      c.parent();
      return ret;
    }

    case "ExpressionStatement": {
      c.firstChild();
      const expr = traverseExpr(c, s);
      checkTrailing(c, s);
      c.parent(); // pop going into stmt
      return { tag: "expr", expr: expr };
    }

    case "IfStatement": {
      c.firstChild(); // "if".
      let stmt = traverseIf(c, s);
      if (stmt.length !== 1) {
        throwParseErr(c, s, "Too many if statements, weird");
      }
      checkTrailing(c, s);
      c.parent();
      return stmt[0];
    }

    case "WhileStatement": {
      c.firstChild(); // "while".
      next(c, s); // Condition.
      let cond = traverseExpr(c, s);
      next(c, s); // Body.
      let body = traverseBody(c, s, false).stmt;
      checkTrailing(c, s);
      c.parent();
      return { tag: "while", cond, body };
    }

    default:
      throwParseErr(c, s, `type: ${c.type.name}`);
  }
}

function traverseIf(c: TreeCursor, s:string): Array<Stmt>  {
  switch (s.substring(c.from, c.to)) {
    case "if":
    case "elif":
      next(c, s); // Condition.
      let cond = traverseExpr(c, s);
      next(c, s); // Body.
      let body = traverseBody(c, s, false).stmt;
      let elseBody = [] as Array<Stmt>;
      if (c.nextSibling()) {
        elseBody = traverseIf(c, s);
      }
      return [{ tag: "if", cond, yes: body, no: elseBody }];
    case "else": {
      next(c, s); // Body.
      let body = traverseBody(c, s, false).stmt;
      return body;
    }
  }
}

function traverseBody(c: TreeCursor, s: string, allowDefvar: boolean): Program {
  let stmtMode = false;
  let defs = [];
  let stmts = [];
  c.firstChild(); // ":".
  while (c.nextSibling()) {
    if (!stmtMode) {
      switch (peekDefP(c, s)) {
        case "defvar": {
          if (!allowDefvar) {
            throwParseErr(c, s, "Can't have variable declaration here");
          } else {
            defs.push(traverseDef(c, s));
          }
          continue;
        }
        case "defun": {
          throwParseErr(c, s, "Nested function definition not allowed");
        }
        case "stmt": {
          stmtMode = true;
          if (c.from !== c.to) {
            stmts.push(traverseStmt(c, s));
          }
          continue;
        }
      }
    } else {
      // StmtMode.
      if (peekDefP(c, s) !== "stmt") {
        throwParseErr(c, s, "Declaration cannot be after Statement");
      } else {
        if (c.from !== c.to) {
          stmts.push(traverseStmt(c, s));
        }
      }
    }
  }
  checkTrailing(c, s);
  c.parent();
  return { tag: "program", def: defs, stmt: stmts };
}

export function traverse(c: TreeCursor, s: string): Program {
  switch(c.node.type.name) {
    case "Script": {
      let defs = [];
      let stmts = [];
      let classes = [];
      let stmtMode = false;
      c.firstChild();
      do {
        if (!stmtMode) {
          if (peekDefP(c, s) === "class") {
            classes.push(traverseClass(c,s));
          }
          else if (peekDefP(c, s) !== "stmt") {
            defs.push(traverseDef(c, s));
          }
          else {
            stmtMode = true;
            stmts.push(traverseStmt(c, s));
          }
        } else {
          // In stmt mode.
          if (peekDefP(c, s) !== "stmt") {
            throwParseErr(c, s, "Declaration cannot be after Statement");
          } else {
            stmts.push(traverseStmt(c, s));
          }
        }
      } while (c.nextSibling())
      // console.log("traversed " + stmts.length + " statements ", stmts, "stopped at " , c.node);
      return { tag: "program", def: defs, stmt: stmts };
    }
    default:
      throwParseErr(c, s, `type: ${c.type.name}`);
  }
}

export function prin1(stuff: Expr): string {
  switch (stuff.tag) {
    case "none":
      return "None"
    case "bool":
      if (stuff.val === "1") {
        return "True"
      } else {
        return "False"
      }
    case "num":
      return stuff.val;
    case "id":
      return stuff.name;
    case "app":
      return `${stuff.fn}(${stuff.args.map(prin1)})`;
    case "binop":
      return `${prin1(stuff.e1)} ${stuff.op} ${prin1(stuff.e2)}`;
    case "uniop":
      return `${stuff.op} ${prin1(stuff.e)}`;
  }
}

export function traverseClass(c: TreeCursor, s: string): Class {
  const fields: Array<Def> = [];
  c.firstChild();
  c.nextSibling(); // Focus on class name
  const className = s.substring(c.from, c.to);
  c.nextSibling(); // Focus on arglist/superclass
  c.nextSibling(); // Focus on body
  c.firstChild(); // Focus colon
  while (c.nextSibling()) {
    // Focuses first field
    fields.push(traverseDef(c, s));
  }
  c.parent();
  c.parent();

  return {
    a: {tag: "class", name: className},
    name: className,
    fields
  };
}


export function parse(source : string) : Program {
  const t = parser.parse(source);
  return traverse(t.cursor(), source);
}
