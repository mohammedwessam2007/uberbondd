#!/usr/bin/env node
import fs from 'node:fs';
import {
  createPhoenixCapsule,verifyPhoenixCapsule,compilePhoenixRecoveryChallenge,
  reconcilePhoenixRecovery,compilePhoenixResumeText
} from '../src/phoenix-continuity-capsule.mjs';

const [mode,file,ackFile]=process.argv.slice(2);
const usage='Usage: node scripts/phoenix-capsule-doctor.mjs make|verify|challenge|resume|reconcile <private-local-capsule.json> [private-ack.json]\nNo network writes, account access or automatic ChatGPT transcript capture. "make" prints a new capsule to stdout; redirect to an owner-private file, never public GitHub.';
const read=fileName=>{
  if(!fileName||fileName==='-'||!fs.statSync(fileName).isFile())throw Error('INPUT_FILE_REQUIRED');
  if(fs.statSync(fileName).size>1_000_000)throw Error('INPUT_TOO_LARGE');
  return JSON.parse(fs.readFileSync(fileName,'utf8'));
};
function output(result){process.stdout.write((typeof result==='string'?result:JSON.stringify(result,null,2))+'\n');}
try{
  if(!['make','verify','challenge','resume','reconcile'].includes(mode)||!file)throw Error(usage);
  const parsed=read(file);
  if(mode==='make'){output(createPhoenixCapsule(parsed));}
  else if(mode==='verify'){
    const result=verifyPhoenixCapsule(parsed);output(result);if(!result.ok)process.exitCode=2;
  }else if(mode==='challenge'){
    const result=compilePhoenixRecoveryChallenge(parsed);output(result);if(!result.ok)process.exitCode=2;
  }else if(mode==='resume'){output(compilePhoenixResumeText(parsed));}
  else{
    const result=reconcilePhoenixRecovery({capsule:parsed,acknowledgment:read(ackFile)});
    output(result);
    if(!result.ok||!result.sourceComplete||result.mainDrift)process.exitCode=2;
  }
}catch(error){process.stderr.write('PHOENIX_DOCTOR_REFUSED: '+String(error.message||error)+'\n');process.exitCode=2;}
