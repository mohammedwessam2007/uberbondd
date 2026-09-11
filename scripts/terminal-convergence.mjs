#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { compileTerminalConvergencePlan } from '../src/terminal-convergence-engine.mjs';
import { adjudicateFrozenGate, selectVerifiedSurvivors } from '../src/terminal-convergence-adjudicator.mjs';

const args=process.argv.slice(2);
const value=name=>{const i=args.indexOf(`--${name}`);return i>=0?String(args[i+1]||''):'';};
const mode=String(value('mode')||'plan').trim().toLowerCase();
const inputPath=value('input');
if(!inputPath)throw new Error('terminal-convergence --input <json> is required');
const resolved=path.resolve(inputPath);
const stat=fs.lstatSync(resolved);
if(!stat.isFile()||stat.isSymbolicLink()||stat.size>5_000_000)throw new Error('terminal-convergence-input-refused');
const input=JSON.parse(fs.readFileSync(resolved,'utf8'));
let result;
if(mode==='plan')result=compileTerminalConvergencePlan(input);
else if(mode==='survivors')result=selectVerifiedSurvivors(input);
else if(mode==='adjudicate')result=adjudicateFrozenGate(input);
else throw new Error('terminal-convergence mode must be plan, survivors, or adjudicate');
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
if(result?.ok!==true)process.exitCode=2;
