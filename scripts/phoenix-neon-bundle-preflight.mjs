#!/usr/bin/env node
import {readFileSync,lstatSync} from 'node:fs';
import {inspectPhoenixNeonZip} from '../src/phoenix-neon-zip-preflight.mjs';
const args=process.argv.slice(2);
if(args.length<1||args.length>2||!args[0]?.endsWith('.zip')||args[0].length>500||
   (args[1]!==undefined&&!/^[0-9a-f]{64}$/.test(args[1]))){
  process.stdout.write(JSON.stringify({ok:false,status:'PHOENIX_NEON_BUNDLE_REFUSED',reason:'EXPLICIT_ZIP_PATH_AND_OPTIONAL_PIN_REQUIRED',releaseAuthority:'NONE'})+'\n');
  process.exitCode=2;
}else {
  let report;
  try{
    const stat=lstatSync(args[0]);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)throw Error('INPUT_REFUSED');
    report=inspectPhoenixNeonZip(readFileSync(args[0]),{expectedSha256:args[1]??null});
  }catch{report={ok:false,status:'PHOENIX_NEON_BUNDLE_REFUSED',reason:'ZIP_INPUT_UNAVAILABLE_OR_INVALID',releaseAuthority:'NONE'};}
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.ok)process.exitCode=2;
}
