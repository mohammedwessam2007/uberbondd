#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readUberLitPointer } from '../src/uberlit-runtime.mjs';
import { diagnoseUberLitRuntime } from '../src/uberlit-runtime-doctor.mjs';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):'';};
const runtimeRoot=path.resolve(arg('root')||process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond');
function safeJson(file){
  try{const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>2_000_000)return null;return JSON.parse(fs.readFileSync(file,'utf8'));}
  catch{return null;}
}
function safeMtime(file){try{const s=fs.lstatSync(file);return s.isFile()&&!s.isSymbolicLink()?s.mtimeMs:null;}catch{return null;}}
let pointer=null;try{pointer=readUberLitPointer({rootDir:runtimeRoot});}catch{}
let expectedSourceCommit=null;try{expectedSourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim().toLowerCase();}catch{}
const verdict=diagnoseUberLitRuntime({
  expectedSourceCommit,
  pointer,
  liveness:safeJson(path.join(runtimeRoot,'runtime','worker-liveness.json')),
  wealthReceiptMtimeMs:safeMtime(path.join(runtimeRoot,'artifacts','universal-wealth-latest.json')),
  maxLivenessAgeMs:Number(process.env.UBERLIT_DOCTOR_LIVENESS_MAX_AGE_MS||30_000),
  maxWealthAgeMs:Number(process.env.UBERLIT_DOCTOR_WEALTH_MAX_AGE_MS||300_000)
});
process.stdout.write(`${JSON.stringify(verdict)}\n`);
if(!verdict.ok)process.exitCode=2;
