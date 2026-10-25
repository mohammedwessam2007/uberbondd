#!/usr/bin/env node
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {screen52,inventoryOmega,subscriptionPreflight,compileOmegaMission} from '../src/ubermind-all-omega-router.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const sample=process.argv[2] ? resolve(process.argv[2]) : null;
const sha='sha256:'+'a'.repeat(64),rubric='sha256:'+'b'.repeat(64);
const file=join(root,'config/ubermind-v6-52-operation-registry.json');
const result={schema:'uberbond.ubermind.all-omega-doctor.v1',asOf:'LOCAL_READ_ONLY',root,
  _52Registry:{path:'config/ubermind-v6-52-operation-registry.json',present:existsSync(file)},
  original890:{pointer:'docs/FOUNDER_890_UNIVERSAL_CROSS_CHAT_INTEGRATION.md',
    exists:existsSync(join(root,'docs/FOUNDER_890_UNIVERSAL_CROSS_CHAT_INTEGRATION.md'))},
  checkoutEvidence:'FILE_PRESENCE_ONLY',billing:'NO_CLAUDE_ACCOUNT_CHECK_PERFORMED'};
if(existsSync(file)){
  const checked=screen52(JSON.parse(readFileSync(file,'utf8')));
  result._52Registry.ok=checked.ok;result._52Registry.coverage=checked.ok?checked.total:0;
  result._52Registry.allApplied=false;result._52Registry.reason=checked.reason??null;
}
const arch=join(root,'docs/architecture');
result.omegaArtifacts=existsSync(arch)?inventoryOmega(readdirSync(arch).map(x=>'docs/architecture/'+x)):[];
const paths=[
'src/ubermind-w40-evidence-first-task-compiler.mjs',
'src/ubermind-w41-proof-constrained-route-auction.mjs',
'src/noetic-autocompiler.mjs',
'src/system-one-decision-adapter.mjs',
'src/jev-shared-state-tensor.mjs',
'docs/UNIVERSAL_CONTEXT_PROTOCOL.md',
'docs/UBERBOND_MASTER_MEMORY.md',
'docs/PHOENIX_CONTEXT_SURVIVAL_PROTOCOL.md',
'config/ubermind-v6-52-operation-registry.json',
'.claude/agents/ubermind-haiku-scout.md',
'.claude/agents/ubermind-sonnet-falsifier.md',
'.claude/agents/ubermind-opus-frontier-judge.md'];
result.capabilityReferences=paths.map(path=>({path,present:existsSync(join(root,path))}));
result.omegaCounts={filesDetected:result.omegaArtifacts.length,
  sourceIndexedOnly:true,allHistoricalGenerationsRead:false};
// Invoke original W40 and W41 directly when present. Do NOT promote their output to executed inference.
result.existingRouters={};
try {
 const {compileUberMindTaskRoute}=await import('../src/ubermind-w40-evidence-first-task-compiler.mjs');
 const route=compileUberMindTaskRoute({taskDigest:'sha256:'+'a'.repeat(64),
  sourceDigest:'sha256:'+'b'.repeat(64),rubricDigest:'sha256:'+'c'.repeat(64),novelty:'frontier'});
 result.existingRouters.W40={modulePresent:true,advisoryCallSucceeded:route.ok===true,
  proposedModel:route.main?.model??null,actualInference:0};
} catch(e){result.existingRouters.W40={modulePresent:existsSync(join(root,'src/ubermind-w40-evidence-first-task-compiler.mjs')),
  advisoryCallSucceeded:false,errorClass:e.name};}
try {
 const {auctionUberMindW41}=await import('../src/ubermind-w41-proof-constrained-route-auction.mjs');
 const auction=auctionUberMindW41({units:[{id:'source-demo',classification:'frontier',
  taskDigest:'sha256:'+'a'.repeat(64),sourceDigest:'sha256:'+'b'.repeat(64),
  rubricDigest:'sha256:'+'c'.repeat(64),baselineInputTokens:1000,
  baselineOutputTokens:100,routes:[]}]});
 result.existingRouters.W41={modulePresent:true,advisoryCallSucceeded:auction.ok===true,
  actualSubscriptionSavingPercent:null,actualInference:0};
} catch(e){result.existingRouters.W41={modulePresent:existsSync(join(root,'src/ubermind-w41-proof-constrained-route-auction.mjs')),
  advisoryCallSucceeded:false,errorClass:e.name};}
result.subscription=subscriptionPreflight(process.env,{});
const m=sample?JSON.parse(readFileSync(sample,'utf8')):{sourceDigest:sha,rubricDigest:rubric,tasks:[
  {id:'find',kind:'lookup',risk:'low',impact:'read',taskDigest:sha,dependsOn:[]},
  {id:'build',kind:'code',risk:'low',impact:'local-write',taskDigest:sha,dependsOn:['find']},
  {id:'verify',kind:'review',risk:'material',impact:'read',taskDigest:sha,dependsOn:['build']},
  {id:'accept',kind:'synthesis',risk:'critical',impact:'read',taskDigest:sha,dependsOn:['verify']}]};
result.exampleRoute=compileOmegaMission(m);
result.success=result._52Registry.ok===true&&result.original890.exists&&
  result.capabilityReferences.every(x=>x.present)&&
  result.existingRouters.W40.advisoryCallSucceeded===true&&
  result.existingRouters.W41.advisoryCallSucceeded===true&&result.exampleRoute.ok;
console.log(JSON.stringify(result,null,2));
process.exitCode=result.success?0:1;