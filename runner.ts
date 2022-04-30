// This is a mashup of tutorials from:
//
// - https://github.com/AssemblyScript/wabt.js/
// - https://developer.mozilla.org/en-US/docs/WebAssembly/Using_the_JavaScript_API

import wabt from 'wabt';
import * as compiler from './compiler';
import {parse} from './parser';

export const defaultImportObject = {
  imports: {
    print: (arg : any) => {
      console.log("Logging from WASM: ", arg);
      const elt = document.createElement("pre");
      document.getElementById("output").appendChild(elt);
      elt.innerText = arg;
      return arg;
    },
    print_bool: (arg: any) => {
      console.log("Logging from WASM: ", arg);
      const elt = document.createElement("pre");
      document.getElementById("output").appendChild(elt);
      if (arg === 1) {
        elt.innerText = "True";
      } else if (arg === 0) {
        elt.innerText = "False";
      } else {
        throw new Error(`print_bool called with ${arg}, impossible`);
      }
      return arg;
    },
    print_none: (arg: any) => {
      console.log("Logging from WASM: ", arg);
      const elt = document.createElement("pre");
      document.getElementById("output").appendChild(elt);
      elt.innerText = "None";
      return arg;
    },
    abs: Math.abs,
    max: Math.max,
    min: Math.min,
    pow: Math.pow
  },
};

// NOTE(joe): This is a hack to get the CLI Repl to run. WABT registers a global
// uncaught exn handler, and this is not allowed when running the REPL
// (https://nodejs.org/api/repl.html#repl_global_uncaught_exceptions). No reason
// is given for this in the docs page, and I haven't spent time on the domain
// module to figure out what's going on here. It doesn't seem critical for WABT
// to have this support, so we patch it away.
if(typeof process !== "undefined") {
  const oldProcessOn = process.on;
  process.on = (...args : any) : any => {
    if(args[0] === "uncaughtException") { return; }
    else { return oldProcessOn.apply(process, args); }
  };
}

export async function runner(source : string, config: {importObject: any}) : Promise<number> {
  const wabtInterface = await wabt();
  const program = parse(source);
  console.log("Parsed:");
  console.log(program);

  const code = compiler.compile(source);

  const importObject = config.importObject;
  const wasmSource = `(module
    (func $print (import "imports" "print") (param i32) (result i32))
    (func $print_bool (import "imports" "print_bool") (param i32) (result i32))
    (func $print_none (import "imports" "print_none") (param i32) (result i32))
    (func $abs (import "imports" "abs") (param i32) (result i32))
    (func $max (import "imports" "max") (param i32 i32) (result i32))
    (func $min (import "imports" "min") (param i32 i32) (result i32))
    (func $pow (import "imports" "pow") (param i32 i32) (result i32))
    ${code})`;
  console.log(`Compiled:\n${wasmSource}`);
  const myModule = wabtInterface.parseWat("test.wat", wasmSource);
  var asBinary = myModule.toBinary({});
  var wasmModule = await WebAssembly.instantiate(asBinary.buffer, importObject);
  const result = (wasmModule.instance.exports.exported_func as any)();
  return result;
}
