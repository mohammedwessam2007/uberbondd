#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {compileDurableWorkloadAssertion,compileCutoverRollbackAssertion,compileProviderLossAssertion} from '../src/runtime-transition-receipts.mjs';

const [kind,inputPath,outputPath]=process.argv.slice(2);
const compilers={durable:compileDurableWorkloadAssertion,cutover:compileCutoverRollbackAssertion,'provider-loss':compileProviderLossAssertion};
if(!compilers[kind]||!inputPath){console.error('usage: runtime-transition-assertion <durable|cutover|provider-loss> <observation-claim.json> [assertion.json]');process.exit(2);}
let input;
try{input=JSON.parse(readFileSync(resolve(inputPath),'utf8'));}catch(error){console.error(JSON.stringify({ok:false,status:'RUNTIME_TRANSITION_ASSERTION_INPUT_UNREADABLE',reason:String(error?.message||error),businessEffectAuthority:'NONE'}));process.exit(2);}
const serialized=JSON.stringify(input);
if(/(?:postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@|DATABASE_URL|ADMIN_TOKEN|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|sk-[A-Za-z0-9_-]{16,})/i.test(serialized)){
  console.error(JSON.stringify({ok:false,status:'RUNTIME_TRANSITION_ASSERTION_INPUT_REFUSED',reasonCodes:['secret-or-credential-shaped-input-prohibited'],businessEffectAuthority:'NONE'}));process.exit(2);
}
const assertion=compilers[kind](input);
const output={...assertion,truthBoundary:'SOURCE_ONLY_ASSERTION__THIS_COMMAND_DOES_NOT_OBSERVE_A_RUNTIME_AND_CANNOT_CREATE_OBSERVED_RUNTIME_EVIDENCE_OR_SATISFY_C17_ACCEPTANCE'};
const rendered=`${JSON.stringify(output,null,2)}\n`;
if(outputPath){const out=resolve(outputPath);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,rendered,'utf8');}else process.stdout.write(rendered);
process.exitCode=assertion.ok===false?2:0;
