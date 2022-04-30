import { Stmt, Expr, Program, Def, Name } from "./ast";
import { parse } from "./parser";
import { Bop, Uop, Type } from "./ast";
import { tcProgram, VarEnv, functionLocalEnv, mergeVarEnv } from "./tc";

// https://learnxinyminutes.com/docs/wasm/

const RETURN_VAR = "$ret";

function compileDef(def: Array<Def>, globals: VarEnv): string {
  let decls = [] as Array<string>;
  for (let d of def) {
    decls = decls.concat(codeGenDef(d, globals));
  }
  return decls.join("\n");
}

function flatten<T>(array: Array<Array<T>>): Array<T> {
  let ret = [] as Array<T>;
  for (let elm of array) {
    ret = ret.concat(elm);
  }
  return ret;
}

export function compile(source: string): string {
  const program = parse(source);
  let [_, globals, newp] = tcProgram(program);

  console.log("Typed:");
  console.log(newp);

  // Declarations.
  const defCode = compileDef(newp.def, globals);

  // Body of main.
  let body = [] as Array<string>;
  for (let stmt of newp.stmt) {
    body = body.concat(codeGenStmt(stmt, globals, true));
  }
  let bodyCode = body.join("\n\t\t");

  return `${defCode}
(func (export "exported_func") (result i32)
\t(local ${RETURN_VAR} i32)
\t(i32.const 0)
\t(local.set ${RETURN_VAR})
${bodyCode}
\t(local.get ${RETURN_VAR}))`;
}

function codeGenStmt(stmt: Stmt, env: VarEnv, returnLast: boolean = false) : Array<string> {
  switch (stmt.tag) {
    case "define": {
      var valStmts = codeGenExpr(stmt.value, env);
      let v = env.get(stmt.name);
      if (!v) {
        throw new Error(`Coudln't find variable ${stmt.name} at compile time`);
      }
      if (v.tag === "global") {
        return valStmts.concat([`(global.set $${stmt.name})`]);
      } else {
        return valStmts.concat([`(local.set $${stmt.name})`]);
      }
    }
    case "expr": {
      var exprStmts = codeGenExpr(stmt.expr, env);
      if (returnLast) {
        // TODO optimize this away.
        return exprStmts.concat([`(local.set ${RETURN_VAR})`]);
      } else {
        return exprStmts.concat([`(drop)`]);
      }
    }
    case "pass": {
      return [];
    }
    case "return": {
      var expr = codeGenExpr(stmt.expr, env);
      return expr.concat([`(return)`]);
    }
    case "if": {
      let code = codeGenExpr(stmt.cond, env);
      let yes = flatten(stmt.yes.map(s => codeGenStmt(s, env, returnLast))).join("\n");
      let no = flatten(stmt.no.map(s => codeGenStmt(s, env, returnLast))).join("\n");
      code.push(`(if\n(then ${yes})\n(else ${no}))`);
      return code;
    }
    case "while": {
      const cond = codeGenExpr(stmt.cond, env).join("\n");
      let body = flatten(stmt.body.map(s => codeGenStmt(s, env, returnLast))).join("\n");
      return [`(block
(loop
${cond}
(i32.const 0)
(i32.eq)
(br_if 1)
${body}
(br 0)))`];
    }
  }
}

function codeGenDef(def: Def, global: VarEnv): Array<string> {
  switch (def.tag) {
    case "defvar": {
      return [`(global $${def.name} (mut i32) ${codeGenExpr(def.value, global)})`];
    }
    case "defun": {
      // Param.
      let param = [] as Array<string>;
      for (let p of def.params) {
        param = param.concat([`(param $${p[0]} i32)`]);
      }
      let paramCode = param.join(" ");
      // Local code.
      let local = [] as Array<string>;
      for (let v of def.body.def) {
        switch (v.tag) {
          case "defvar": {
            local.push(`(local $${v.name} i32)`);
            local = local.concat(codeGenExpr(v.value, global));
            local.push(`(local.set $${v.name})`);
          }
          case "defun" :
            new Error("Nested function in compilation time, shouldn't happen");
        }
      }
      let localCode = local.join("\n\t");
      // Env.
      let env = mergeVarEnv(global, functionLocalEnv(def));
      // Body.
      let body = [] as Array<string>;
      for (let stmt of def.body.stmt) {
        body = body.concat(codeGenStmt(stmt, env));
      }
      let bodyCode = body.join("\n\t");
      // Assembly.
      return [`(func $${def.name} ${paramCode} (result i32)
\t${localCode}
\t${bodyCode}
(unreachable)
(i32.const 0)
(return))`]
    }
  }
}

function codeGenBinop(op: Bop) : string {
  switch (op) {
    case "+":
      return "i32.add";
    case "-":
      return "i32.sub";
    case "*":
      return "i32.mul";
    case "//":
      return "i32.div_s";
    case "%":
      return "i32.rem_s";
    case "==":
      return "i32.eq";
    case "!=":
      return "i32.ne";
    case "<=":
      return "i32.le_s";
    case ">=":
      return "i32.ge_s";
    case "<":
      return "i32.lt_s";
    case ">":
      return "i32.gt_s";
    case "is":
      throw new Error("We shouldn't see 'is' in compile time");
  }
}

function codeGenUniop(op: Uop, e: Expr, env: VarEnv): Array<string> {
  switch (op) {
    case "-": {
      let zero = codeGenExpr({tag: "num", val: "0"}, env);
      let exp = zero.concat(codeGenExpr(e, env));
      return exp.concat([`(i32.sub)`]);
    }
    case "not": {
      let exp = codeGenExpr(e, env);
      return exp.concat([`(i32.const 0)`, `(i32.eq)`])
    }
  }
}

function codeGenExpr(expr: Expr, env: VarEnv) : Array<string> {
  switch(expr.tag) {
    case "app": {
      let args: Array<string> = [];
      for (let arg of expr.args) {
        args = args.concat(codeGenExpr(arg, env));
      }
      let fn = expr.fn;
      if (expr.fn === "print" && expr.args[0].a.tag === "bool") {
        fn = "print_bool";
      } else if (expr.fn === "print" && expr.args[0].a.tag === "none") {
        fn = "print_none";
      }
      return args.concat([`(call $${fn})`]);
    }
    case "binop": {
      const e1 = codeGenExpr(expr.e1, env);
      const e2 = e1.concat(codeGenExpr(expr.e2, env));
      return e2.concat([`(${codeGenBinop(expr.op)})`]);
    }
    case "uniop": {
      return codeGenUniop(expr.op, expr.e, env);
    }
    case "id": {
      let v = env.get(expr.name);
      if (!v) {
        console.log("Env:");
        console.log(env);
        throw new Error(`Coudln't find variable ${expr.name} at compile time`);
      }
      switch (v.tag) {
        case "global":
          return [`(global.get $${expr.name})`];
        case "local":
          return [`(local.get $${expr.name})`];
        case "param": {
          return [`(local.get $${expr.name})`];
        }
      }
    }
    case "num":
      return [`(i32.const ${expr.val})`];
    case "none":
      return [`(i32.const ${expr.val})`];
    case "bool":
      return [`(i32.const ${expr.val})`];
    case "paren":
      return codeGenExpr(expr.e, env);
  }
}
