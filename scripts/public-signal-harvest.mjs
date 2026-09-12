#!/usr/bin/env node
import fs from 'node:fs';
import {compileXListeningPlan,dedupePublicPosts,atomizePublicPost,buildGamechangerObservationFromPublicPost} from '../src/public-signal-harvester.mjs';

const args=new Set(process.argv.slice(2));
if(args.has('--plan')){
 const profile=JSON.parse(fs.readFileSync(new URL('../data/gamechanger-mesh/x-listening-profile.json',import.meta.url),'utf8'));
 console.log(JSON.stringify(compileXListeningPlan(profile),null,2));
 process.exit(0);
}

const raw=fs.readFileSync(0,'utf8').trim();
const rows=raw?raw.split(/\n+/).map(line=>JSON.parse(line)):[];
const deduped=dedupePublicPosts(rows);
const output={
 schemaVersion:'uberbond.public-signal-harvest-receipt.v1',
 generatedAt:new Date().toISOString(),
 inputCount:deduped.inputCount,
 uniqueCount:deduped.uniqueCount,
 invalidCount:deduped.invalid.length,
 observations:deduped.posts.map(post=>buildGamechangerObservationFromPublicPost({ok:true,post}).observation),
 atoms:deduped.posts.map(post=>({fingerprint:post.fingerprint,atoms:atomizePublicPost({ok:true,post}).atoms})),
 authority:'PUBLIC_READ_RESEARCH_ONLY',
 promotionAuthority:'NONE'
};
console.log(JSON.stringify(output,null,2));
