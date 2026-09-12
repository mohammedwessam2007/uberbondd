#!/usr/bin/env node
import fs from 'node:fs';
import { buildFrontierLearningRuntimePlan, runFrontierLearningCycle } from '../src/frontier-learning-runtime.mjs';
const args=new Set(process.argv.slice(2));
if(args.has('--plan')){console.log(JSON.stringify(buildFrontierLearningRuntimePlan(),null,2));process.exit(0);}
const raw=fs.readFileSync(0,'utf8').trim();
const payload=raw?JSON.parse(raw):{observations:[]};
console.log(JSON.stringify(runFrontierLearningCycle({observations:Array.isArray(payload.observations)?payload.observations:[],maxInvestigations:payload.maxInvestigations??8}),null,2));
