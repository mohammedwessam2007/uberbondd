#!/usr/bin/env node
import fs from 'node:fs';
import { compileFrontierBrain } from '../src/frontier-capability-fusion.mjs';

function readInput(){
  const raw=fs.readFileSync(0,'utf8').trim();
  if(!raw) throw new Error('expected JSON on stdin');
  return JSON.parse(raw);
}

try {
  const input=readInput();
  const result=compileFrontierBrain(input);
  process.stdout.write(`${JSON.stringify({schema:'uberbond.frontier-brain-compile.receipt.v1',generatedAt:new Date().toISOString(),...result},null,2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({schema:'uberbond.frontier-brain-compile.error.v1',error:String(error?.message||error)})}\n`);
  process.exitCode=1;
}
