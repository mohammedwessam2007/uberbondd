#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  clearUberLitTypeSafeKey,
  inspectUberLitTypeSafeKey,
  storeUberLitTypeSafeKey
} from '../src/uberlit-typesafe-secret.mjs';

const command=String(process.argv[2]||'status').trim().toLowerCase();
const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):'';};
const runtimeRoot=path.resolve(arg('root')||process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond');
const json=value=>process.stdout.write(`${JSON.stringify(value,null,2)}\n`);

if(command==='status') json(inspectUberLitTypeSafeKey({runtimeRoot}));
else if(command==='store'){
  if(process.stdin.isTTY) throw new Error('typesafe-key-must-arrive-on-stdin');
  const apiKey=fs.readFileSync(0,'utf8').trim();
  json(storeUberLitTypeSafeKey({apiKey,runtimeRoot}));
}else if(command==='clear') json(clearUberLitTypeSafeKey({runtimeRoot}));
else throw new Error('usage: uberlit-typesafe-secret.mjs status|store|clear [--root PATH]');
