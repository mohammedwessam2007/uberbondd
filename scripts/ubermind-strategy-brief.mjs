#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileStrategicBrief } from "../src/ubermind-strategy-brief.mjs";
const argv=process.argv.slice(2);
if(argv.length===0||argv.includes("--help")){
  console.log("Usage: node scripts/ubermind-strategy-brief.mjs --mission \"text\" [--json]\nZero model calls; output is a source map, NOT a completed recommendation.");
  process.exit(argv.includes("--help")?0:2);
}
const pos=argv.indexOf("--mission");
if(pos<0||!argv[pos+1]||argv.some((x,i)=>x.startsWith("--")&&x!=="--mission"&&x!=="--json")){
  console.error("Expected --mission followed by text; optional --json");process.exit(2);
}
try{
  const index=JSON.parse(readFileSync(resolve("config/ubermind-omega47-strategic-philosophy-index.json"),"utf8"));
  const packet=compileStrategicBrief(argv[pos+1],index);
  console.log(JSON.stringify(packet,null,argv.includes("--json")?2:0));
}catch(e){console.error("BRIEF_ERROR: "+e.message);process.exit(1)}
