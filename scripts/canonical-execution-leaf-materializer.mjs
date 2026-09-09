#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { materializeCanonicalExecutionLeaves } from '../src/canonical-execution-leaf-materializer.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function readJson(path){return JSON.parse(readFileSync(join(root,path),'utf8'));}
export function generateCanonicalExecutionLeafGraph(){
 const coverage=readJson('artifacts/sovereign/implementation-coverage-matrix.json');
 const graph=materializeCanonicalExecutionLeaves({coverage});
 if(!graph.ok)return graph;
 const relative='artifacts/sovereign/canonical-execution-leaf-graph.json';const path=join(root,relative);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,`${JSON.stringify(graph,null,2)}\n`);
 return{ok:true,status:'CANONICAL_EXECUTION_LEAF_GRAPH_WRITTEN',sourceCommit:graph.sourceCommit,requirements:graph.counts.requirements,leaves:graph.counts.leaves,orphans:graph.counts.orphanRequirements,floatingLeaves:graph.counts.floatingLeaves,output:relative,businessEffectAuthority:'NONE'};
}
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);if(direct){try{const out=generateCanonicalExecutionLeafGraph();process.stdout.write(`${JSON.stringify(out,null,2)}\n`);if(!out.ok)process.exitCode=1;}catch(error){process.stderr.write(`${JSON.stringify({ok:false,status:'CANONICAL_EXECUTION_LEAF_GRAPH_GENERATION_CRASHED',reason:String(error?.message||error),businessEffectAuthority:'NONE'},null,2)}\n`);process.exitCode=1;}}
