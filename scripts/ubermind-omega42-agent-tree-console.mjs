#!/usr/bin/env node
// Offline operator: run fixed native W40/W41 tests against this checkout, then
// show a truthful report. Never accepts arbitrary commands or reaches models.
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileOmega42AgentTree,renderOmega42AgentTreeHtml} from '../src/ubermind-omega42-agent-tree-console.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const tests=['tests/ubermind-w40-evidence-first-task-compiler.test.mjs','tests/ubermind-w41-proof-constrained-route-auction.test.mjs','tests/ubermind-omega42-agent-tree-console.test.mjs'];
export function buildOmega42LocalConsole({contractPath,htmlPath=null}={}){
 if(typeof contractPath!=='string'||!contractPath.trim())throw Error('CONTRACT_FILE_REQUIRED');
 const path=resolve(contractPath),st=statSync(path);
 if(!st.isFile()||st.size>65536)throw Error('CONTRACT_TOO_LARGE');
 const contract=JSON.parse(readFileSync(path,'utf8'));
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const porcelain=execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:root,encoding:'utf8'});
 // Untracked source/tests can change behavior just like tracked edits. Never
 // bind a test result to HEAD unless BOTH tracked and untracked are absent.
 const clean=porcelain.trim().length===0;
 const run=spawnSync(process.execPath,['--test','--test-reporter=tap',...tests],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:2_000_000});
 const output=(run.stdout||'')+'\n'+(run.stderr||'');
 const pass=Number(/^# pass (\d+)$/m.exec(output)?.[1]);
 const fail=Number(/^# fail (\d+)$/m.exec(output)?.[1]);
 const total=Number(/^# tests (\d+)$/m.exec(output)?.[1]);
 const evidence=Number.isSafeInteger(total)&&Number.isSafeInteger(pass)&&Number.isSafeInteger(fail)&&
  total>0&&pass+fail===total&&run.status===0?{
   executionOrigin:'LOCAL_NODE_CHILD_PROCESS',checkoutCommit:head,total,pass,fail,testFiles:tests,
   testSourceDigest:sha(tests.map(t=>readFileSync(join(root,t))).map(x=>sha(x)).join('|')),
   receiptDigest:sha(JSON.stringify({head,tests,pass,fail,total,outputDigest:sha(output)}))
  }:null;
 const result=compileOmega42AgentTree({contract,nativeTestEvidence:evidence,checkout:{head,clean}});
 const report={...result,operator:{testProcessExit:run.status,signal:run.signal,testSummaryParsed:!!evidence,
  testOutputDigest:sha(output),checkoutCleanAtTestStart:clean,
  warning:'The tests verify W40/W41/Ω42 modules only; model calls, team membership, quality acceptance and actual subscription use remain unobserved.'}};
 if(htmlPath&&report.ok)writeFileSync(resolve(htmlPath),renderOmega42AgentTreeHtml(result),'utf8');
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length<3||process.argv.length>4)throw Error('USAGE: node scripts/ubermind-omega42-agent-tree-console.mjs <contract.json> [output.html]');
  const result=buildOmega42LocalConsole({contractPath:process.argv[2],htmlPath:process.argv[3]});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!result.ok||result.operator.testProcessExit!==0)process.exitCode=2;
 }catch(e){console.error('OMEGA42_CONSOLE_REFUSED: '+String(e.message||e).slice(0,180));process.exitCode=2;}
}
