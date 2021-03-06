import { importObject } from "./import-object.test";
import * as compiler from "../compiler";
import {parse} from '../parser';
import wabt from 'wabt';
import {tcProgram} from '../tc';
import {runner} from '../runner';

// Modify typeCheck to return a `Type` as we have specified below
export function typeCheck(source: string) : Type {
  return "none";
}

// Modify run to use `importObject` (imported above) to use for printing
// You can modify `importObject` to have any new fields you need here, or
// within another function in your compiler, for example if you need other
// JavaScript-side helpers
export async function run(source: string) {
  let config = {importObject};
  await runner(source, config);
}

type Type =
  | "int"
  | "bool"
  | "none"
  | { tag: "object", class: string }

export const NUM : Type = "int";
export const BOOL : Type = "bool";
export const NONE : Type = "none";
export function CLASS(name : string) : Type { 
  return { tag: "object", class: name }
};
