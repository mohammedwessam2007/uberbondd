#!/usr/bin/env node
import {compileNeuralAtlasPlan,NEURAL_REPOSITORY_TARGET} from '../src/neural-repository-atlas.mjs';

const args=new Map(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return i===-1?[arg,true]:[arg.slice(0,i),arg.slice(i+1)];}));
const target=Number(args.get('--target')||NEURAL_REPOSITORY_TARGET);
const pushedAfter=args.get('--pushed-after')||null;
const plan=compileNeuralAtlasPlan({target:Number.isSafeInteger(target)&&target>0?target:NEURAL_REPOSITORY_TARGET,pushedAfter});
console.log(JSON.stringify({...plan,executionAuthority:'READ_ONLY_DISCOVERY',activationAuthority:'NONE',nextStage:'feed query strata into capability genome public repository harvester; canonicalize, inspect, benchmark and promote only verified winners'},null,2));
