#!/usr/bin/env node
/** No network calls. Source-indexed historical interpretations only. */
import { machiavelliCorpusStatus,searchMachiavelliPrinciples,getMachiavelliPrinciple,machiavelliChapter } from '../src/machiavelli-strategic-canon.mjs';
const [mode,...args]=process.argv.slice(2);
let result;
if(mode==='status'&&args.length===0)result=machiavelliCorpusStatus();
else if(mode==='search'&&args.length>=1&&args.length<=2)result=searchMachiavelliPrinciples({query:args[0],limit:args.length===2?Number(args[1]):8});
else if(mode==='get'&&args.length===1)result=getMachiavelliPrinciple(args[0]);
else if(mode==='chapter'&&args.length>=2&&args.length<=3){const [work,a,b]=args;result=machiavelliChapter({work,book:work==='PRINCE'?null:Number(a),chapter:work==='PRINCE'?Number(a):b===undefined?null:Number(b)});}
else result={ok:false,status:'USAGE_ERROR',usage:'node scripts/machiavelli-canon.mjs status | search "reputation trust" [limit] | get MACH-0001 | chapter PRINCE 18 | chapter DISCOURSES 1 4 | chapter ART_OF_WAR 3'};
console.log(JSON.stringify(result,null,2));
if(!result.ok)process.exitCode=2;
