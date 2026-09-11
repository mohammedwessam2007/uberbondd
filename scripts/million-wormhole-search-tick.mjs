#!/usr/bin/env node
import { compileRecursiveWormholeRound } from '../src/million-wormhole-tournament.mjs';

const args=new Map();
for(let index=2;index<process.argv.length;index++){
  const arg=process.argv[index];
  if(!arg.startsWith('--'))continue;
  const next=process.argv[index+1];
  args.set(arg,next&&!next.startsWith('--')?process.argv[++index]:true);
}
const shardIndex=Number(args.get('--shard')??0);
const topK=Number(args.get('--top')??32);
const round=Number(args.get('--round')??0);
const target=String(args.get('--target')||'SEARCH_POLICY').trim().slice(0,120)||'SEARCH_POLICY';
const result=compileRecursiveWormholeRound({shardIndex,topK,round,target});
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
if(result.ok===false)process.exitCode=1;
