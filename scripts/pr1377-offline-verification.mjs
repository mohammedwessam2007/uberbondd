/**
 * PR1377 no-hosted-CI verification lane. Works in an already authenticated
 * local checkout, no GitHub Actions or cloud build allowance required.
 *
 * It intentionally does not mark GitHub checks green or authorize merging,
 * payment, changes to repo visibility, outbound or deployment.
 * Scrubs application credentials from child test process environment.
 */
import {spawnSync} from 'node:child_process';
import {readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PR1377_OFFLINE_CI_SCHEMA='uberbond.pr1377.offline-ci.v1';
const prefixes=/^(prospect|frozen-|gspot-|proof-factory|revenue-singularity|green-lane|contact-source)/;
export function discoverPR1377FocusedTests({root=process.cwd()}={}){
 const testDir=resolve(root,'tests');
 if(!existsSync(testDir))return [];
 return readdirSync(testDir).filter(n=>prefixes.test(n)&&n.endsWith('.test.mjs')).sort().map(n=>resolve(testDir,n));
}
export function runPR1377OfflineChecks({root=process.cwd(),timeoutMs=240000}={}){
 const files=discoverPR1377FocusedTests({root});
 if(!files.length)return {schema:PR1377_OFFLINE_CI_SCHEMA,
  status:'NO_FOCUSED_TEST_FILES',verified:false,externalEffects:0,providerCalls:0};
 const git=spawnSync('git',['rev-parse','HEAD'],{
   cwd:root,encoding:'utf8',timeout:3000,
   env:{PATH:process.env.PATH??'/usr/bin:/bin'}
 });
 const sha=git.status===0?/^[a-f0-9]{40}$/.test(git.stdout.trim())?git.stdout.trim():null:null;
 const env={PATH:process.env.PATH??'/usr/bin:/bin',NODE_ENV:'test',CI:'true',
   HOME:process.env.HOME??'/tmp'};
 const child=spawnSync(process.execPath,['--test','--test-concurrency=1',...files],{
   cwd:root,encoding:'utf8',timeout:Math.min(600000,Math.max(1000,timeoutMs)),
   maxBuffer:4*1024*1024,env
 });
 const raw=(child.stdout??'')+'\n'+(child.stderr??'');
 const counter=k=>{
   const matches=raw.match(new RegExp('^\\s*# '+k+' (\\d+)\\s*$','gm'));
   return matches?.length?Number(matches[matches.length-1].match(/\d+/)?.[0]):null;
 };
 const passed=counter('pass'),failed=counter('fail'),skipped=counter('skipped');
 return {
   schema:PR1377_OFFLINE_CI_SCHEMA,
   status:child.status===0?'LOCAL_FOCUSED_SUITE_PASSED':
      child.error?'LOCAL_TEST_RUNNER_ERROR':'LOCAL_FOCUSED_SUITE_FAILED',
   localHeadSha:sha,selectedTestFileCount:files.length,
   passed,failed,skipped,exitCode:child.status,
   stdoutTail:raw.slice(-1800),verified:child.status===0,
   githubActionsStatus:'NOT_CHANGED',sameProductionCodeDeployed:false,
   exactPRHeadCompared:false,legalSendAuthority:false,
   externalEffects:0,providerCalls:0,cloudDeploymentTriggered:false,
   note:'Node test runner executed against local working tree. Do not infer PR head parity without comparing localHeadSha and a clean git status with live GitHub ref; two historical unrelated payment-bridge failures may persist.'
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=runPR1377OfflineChecks({root:process.cwd()});
 process.stdout.write(JSON.stringify(output,null,2)+'\n');
 if(!output.verified)process.exitCode=1;
}
