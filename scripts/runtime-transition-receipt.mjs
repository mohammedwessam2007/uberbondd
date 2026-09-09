#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {compileDurableWorkloadReceipt,compileCutoverRollbackReceipt,compileProviderLossReceipt} from '../src/runtime-transition-receipts.mjs';

const [kind,inputPath,outputPath]=process.argv.slice(2);
const compilers={durable:compileDurableWorkloadReceipt,cutover:compileCutoverRollbackReceipt,'provider-loss':compileProviderLossReceipt};
if(!compilers[kind]||!inputPath){console.error('usage: runtime-transition-receipt <durable|cutover|provider-loss> <observation.json> [receipt.json]');process.exit(2);}
let input;
try{input=JSON.parse(readFileSync(resolve(inputPath),'utf8'));}catch(error){console.error(JSON.stringify({ok:false,status:'RUNTIME_TRANSITION_INPUT_UNREADABLE',reason:String(error?.message||error),businessEffectAuthority:'NONE'}));process.exit(2);}
const serialized=JSON.stringify(input);
if(/(?:postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@|DATABASE_URL|ADMIN_TOKEN|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|sk-[A-Za-z0-9_-]{16,})/i.test(serialized)){
  console.error(JSON.stringify({ok:false,status:'RUNTIME_TRANSITION_INPUT_REFUSED',reasonCodes:['secret-or-credential-shaped-input-prohibited'],businessEffectAuthority:'NONE'}));process.exit(2);
}
const receipt=compilers[kind](input);
const rendered=`${JSON.stringify(receipt,null,2)}\n`;
if(outputPath){const out=resolve(outputPath);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,rendered,'utf8');}else process.stdout.write(rendered);
process.exitCode=receipt.ok===false?2:0;
