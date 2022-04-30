import { Expr, Stmt, Type, Def, Program, Name, EnvVar } from "./ast";
import { prin1, typeAssert } from "./parser";

export type FunctionsEnv = Map<Name, [Type[], Type]>;
export type VarEnv = Map<Name, EnvVar>;

export class TypeError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "TypeError";
    Object.setPrototypeOf(this, TypeError.prototype);
  }
}

export class NumOfArgError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "NumOfArgError";
    Object.setPrototypeOf(this, NumOfArgError.prototype);
  }
}

export class ReferenceError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "ReferenceError";
    Object.setPrototypeOf(this, ReferenceError.prototype);
  }
}

function last<T>(array: Array<T>): T {
  if (array.length === 0) {
    throw new Error("Array has to have at least one element");
  } else {
    return array[array.length - 1];
  }
}

function throwNotFound(id: Name) {
  throw new ReferenceError(`${id} is not defined.`);
}

function throwDupDef(id: Name) {
  throw new ReferenceError(`Duplicate declaration of ${id}`);
}

function throwTypeError(e: Expr, expect: Type, got: Type) {
  throw new TypeError(`expression: ${prin1(e)}, expecting ${expect}, got ${got}`);
}

function throwNumOfArg(fn: Name, expect: number, got: number) {
  throw new NumOfArgError(`${fn} expects ${expect} arguments but got ${got}`)
}

function assertType(e: Expr, t: Type) {
  if (e.a.tag !== t.tag) {
    throwTypeError(e, t, e.a);
  }
}

function assertNumOfArg(fn: Name, args: Array<Expr>, expect: number) {
  if (args.length != expect) {
    throwNumOfArg(fn, expect, args.length);
  }
}

function throwIdAssignError(id: Name, expect: Type, got: Type) {
  throw new TypeError(`variable: ${id} with type ${expect} cannot be assigned value of type ${got}`);
}

function getVar(name: Name, env: VarEnv): EnvVar {
  if (!env.get(name)) {
    throwNotFound(name);
  } else {
    return env.get(name);
  }
}

function tcExpr(e: Expr, fns: FunctionsEnv, vars: VarEnv): Expr {
  switch(e.tag) {
    case "bool": return { ...e, a: {tag: "bool"} };
    case "num": return { ...e, a: {tag: "int"} };
    case "none": return { ...e, a: {tag: "none"} };
    case "id": {
      return { ...e, a: getVar(e.name, vars).a };
    }
    case "binop": {
      switch(e.op) {
        case "+":
        case "-":
        case "*":
        case "//":
        case "%": {
          const e1 = tcExpr(e.e1, fns, vars);
          const e2 = tcExpr(e.e2, fns, vars);
          assertType(e1, {tag: "int"});
          assertType(e2, {tag: "int"});
          return { ...e, a: {tag: "int"}, e1, e2 };
        }
        case "==":
        case "!=":
        case "<=":
        case ">=":
        case "<":
        case ">": {
          const e1 = tcExpr(e.e1, fns, vars);
          const e2 = tcExpr(e.e2, fns, vars);
          assertType(e2, e1.a);
          return { ...e, a: {tag: "bool"}, e1, e2 };
        }
        case "is": {
          let left = tcExpr(e.e1, fns, vars);
          if (e.e2.tag !== "none") {
            throw new TypeError(`Rhs of "is" can only be None`);
          }
          if (left.a === {tag: "none"}) {
            return { tag: "bool", a: {tag: "bool"}, val: "1" };
          }else {
            return { tag: "bool", a: {tag: "bool"}, val: "0" };
          }
        }
        default:
          // Should be impossible.
          return e;
      }
    }
    case "uniop": {
      switch (e.op) {
        case "-": {
          const newe = tcExpr(e.e, fns, vars);
          assertType(newe, {tag: "int"});
          return { ...e, a: {tag: "int"}, e: newe };
        }
        case "not": {
          const newe = tcExpr(e.e, fns, vars);
          assertType(newe, {tag: "bool"})
          return { ...e, a: {tag: "bool"}, e: newe };
        }
        default:
          // Should be impossible.
          return e;
      }
    }
    case "app": {
      switch (e.fn) {
        case "print": {
          assertNumOfArg(e.fn, e.args, 1);
          let newarg = tcExpr(e.args[0], fns, vars);
          return { ...e, a: {tag: "none"}, args: [newarg] };
        }
        case "abs": {
          assertNumOfArg(e.fn, e.args, 1);
          let newarg = tcExpr(e.args[0], fns, vars);
          assertType(newarg, {tag: "int"})
          return { ...e, a: {tag: "int"}, args: [newarg] };
        }
        case "max":
        case "min":
        case "pow": {
          assertNumOfArg(e.fn, e.args, 2);
          let arg1 = tcExpr(e.args[0], fns, vars);
          let arg2 = tcExpr(e.args[1], fns, vars);
          assertType(arg1, {tag: "int"});
          assertType(arg2, {tag: "int"});
          return { ...e, a: {tag: "int"}, args: [arg1, arg2] };
        }
        default: {
          // Custom function.
          if(!fns.has(e.fn)) {
            throwNotFound(e.fn);
          }
          let newargs: Array<Expr> = [];
          const [paramtype, ret] = fns.get(e.fn);
          assertNumOfArg(e.fn, e.args, paramtype.length);
          e.args.forEach((arg, idx) => {
            const newarg = tcExpr(arg, fns, vars);
            assertType(newarg, paramtype[idx]);
            newargs.push(newarg);
          })
          return { ...e, a: ret, args: newargs };
        }
      }
    }
    case "paren": {
      let newExpr = tcExpr(e.e, fns, vars);
      return { ...e, a: newExpr.a, e: newExpr };
    }
  }
}

function tcStmt(s : Stmt, fns : FunctionsEnv, vars : VarEnv, ret: Type | false): Stmt {
  switch(s.tag) {
    case "define": {
      const rhs = tcExpr(s.value, fns, vars);
      const varType = getVar(s.name, vars).a;
      if (varType.tag !== rhs.a.tag) {
        throwIdAssignError(s.name, varType, rhs.a);
      }
      return { ...s, value: rhs };
    }
    case "expr": {
      let exp = tcExpr(s.expr, fns, vars);
      // console.log(exp);
      return { ...s, expr: exp };
    }
    case "pass":
      return s;
    case "return": {
      let exp = tcExpr(s.expr, fns, vars);
      if (ret) {
        assertType(exp, ret);
      }
      return { ...s, expr: exp };
    }
    case "if": {
      let cond = tcExpr(s.cond, fns, vars);
      assertType(cond, {tag: "bool"});
      let yes = s.yes.map((stmt) => tcStmt(stmt, fns, vars, ret));
      let no = s.no.map((stmt) => tcStmt(stmt, fns, vars, ret));
      return { ...s, cond, yes, no};
    }
    case "while": {
      let cond = tcExpr(s.cond, fns, vars);
      assertType(cond, {tag: "bool"});
      let body = s.body.map((stmt) => tcStmt(stmt, fns, vars, ret));
      return { ...s, cond, body };
    }
  }
}

// This function collects declared variable and function types, but
// don’t type check them.
function extractDefEnv(defs: Array<Def>, asLocal: boolean): [FunctionsEnv, VarEnv] {
  let vars = new Map<Name, EnvVar>();
  let functions = new Map<Name, [Type[], Type]>();
  let dummyf = new Map<Name, [Type[], Type]>();
  let dummyv = new Map<Name, EnvVar>();
  for (let def of defs) {
    switch (def.tag) {
      case "defvar": {
        if (vars.get(def.name)) {
          throwDupDef(def.name);
        } else {
          let newval = tcExpr(def.value, dummyf, dummyv);
          assertType(newval, def.t);
          if (asLocal) {
            vars.set(def.name, { tag: "local", a: def.t});
          } else {
            vars.set(def.name, { tag: "global", a: def.t});
          }
        }
        continue;
      }
      case "defun": {
        if (functions.get(def.name)) {
          throwDupDef(def.name);
        } else {
          let paramType = def.params.map(x => x[1]);
          let signiture = [paramType, def.ret] as [Type[], Type];
          functions.set(def.name, signiture);
        }
      }
    }
  }
  return [functions, vars];
}

// Return the parameters and local variables env.
export function functionLocalEnv(def: Def): VarEnv {
  switch (def.tag) {
    case "defvar":
      throw new Error(`functionLocalEnv called on defvar: ${def}`);
    case "defun": {
      let env = new Map<Name, EnvVar>();
      let idx = 0;
      for (let param of def.params) {
        if (param[1] == {tag: "int" }|| param[1] == {tag: "bool"}) {
          env.set(param[0], { tag: "param", a: param[1], idx });
        } else {
          throw new Error("Unrecognized parameter type, should be impossible.")
        }
        idx = idx + 1;
      }
      let [_, vars] = extractDefEnv(def.body.def, true);
      vars.forEach((varVal, varName) => {
        if (env.get(varName)) {
          throwDupDef(varName);
        } else {
          env.set(varName, varVal)
        }
      });
      return env;
    }
  }
}

function returnType(stmt: Stmt, fns: FunctionsEnv, vars: VarEnv): Type {
  switch (stmt.tag) {
    case "define":
    case "expr":
    case "pass":
      return {tag: "none"}
    case "return":
      return tcExpr(stmt.expr, fns, vars).a;
    case "if": {
      let yes = returnType(last(stmt.yes), fns, vars);
      let no = returnType(last(stmt.no), fns, vars);
      if (yes !== no) {
        throw new TypeError(`Two branches have different return type, one is ${yes}, one is ${no}`);
      } else {
        return yes;
      }
    }
    case "while": {
      return returnType(last(stmt.body), fns, vars);
    }
  }
}

export function mergeVarEnv(base: VarEnv, overwrite: VarEnv): VarEnv {
  let env = new Map(base);
  overwrite.forEach((val, key) => {
    env.set(key, val);
  });
  return env;
}

function tcDef(defs: Array<Def>, asLocal: boolean): Array<Def> {
  let [fns, globals] = extractDefEnv(defs, asLocal);
  let newDefs = [];
  for (let def of defs) {
    switch (def.tag) {
      case "defvar": {
        // Defvars has predetermined type.
        newDefs.push(def);
        continue;
      }
      case "defun": {
        let env = mergeVarEnv(globals, functionLocalEnv(def));
        // Now env contains all visible variables for this function.
        // We type check each statement.
        let newStmts = [];
        for (let stmt of def.body.stmt) {
          console.log(stmt);
          newStmts.push(tcStmt(stmt, fns, env, def.ret));
        }
        let newBody = { ...def.body, stmt: newStmts };
        newDefs.push({ ...def, body: newBody });
        // We also check for the return type.
        const lastStmt = newStmts[newStmts.length - 1];
        let ret = returnType(lastStmt, fns, env);
        if (ret !== def.ret) {
          throw new TypeError(`Function is declared to return ${def.ret}, but the actual return type is ${ret}`);
        }
      }
    }
  }
  return newDefs;
}

export function tcProgram(program: Program): [FunctionsEnv, VarEnv, Program] {
  // p.forEach(s => {
  //   if(s.tag === "define") {
  //     functions.set(s.name, [s.parameters.map(p => p.typ), s.ret]);
  //   }
  // });
  const [functions, globals] = extractDefEnv(program.def, false);
  const newDef = tcDef(program.def, false);
  let newStmt = [];
  for (let stmt of program.stmt) {
    let env = new Map(globals);
    let ns = tcStmt(stmt, new Map(functions), env, false);
    // console.log(ns)
    newStmt.push(ns);
  }
  const newProgram = { ...program, def: newDef, stmt: newStmt };
  return [functions, globals, newProgram];
}
