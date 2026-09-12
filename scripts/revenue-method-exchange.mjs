#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { compileRevenueMethodExchange } from '../src/revenue-method-exchange.mjs';

const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
const configPath=path.resolve(arg('--config')||'config/revenue-method-exchange.json');
const outPath=arg('--out')?path.resolve(arg('--out')):null;

const raw=JSON.parse(await fs.readFile(configPath,'utf8'));
if(raw?.schema!=='uberbond.revenue-method-exchange.config.v1') throw new Error('revenue-method-exchange-config-v1-required');
if(raw?.mode!=='PAPER_CANARY_SELECTION') throw new Error('paper-canary-selection-mode-required');
if(raw?.externalEffectAuthority!=='NONE') throw new Error('external-effect-authority-refused');
const result=compileRevenueMethodExchange({methods:raw.methods,maxCanaries:raw.maxCanaries});
const receipt={schema:'uberbond.revenue-method-exchange.receipt.v1',config:configPath,forecastTruth:raw.forecastTruth,sourceInspiration:raw.sourceInspiration||[],...result};
if(outPath){await fs.mkdir(path.dirname(outPath),{recursive:true});await fs.writeFile(outPath,`${JSON.stringify(receipt,null,2)}\n`);}
process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
