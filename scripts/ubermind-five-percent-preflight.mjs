import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {auditDirectClaudeImports} from './ubermind-startup-context-audit.mjs';
import {runUberMindLiveSourceWork} from '../src/ubermind-exact-source-work.mjs';
import {calculateUberMindFivePercent} from '../src/ubermind-five-percent-compression-gate.mjs';

export const UBERMIND_FIVE_PERCENT_PREFLIGHT_SCHEMA='uberbond.ubermind.five-percent-native-preflight.v1';

/**
 * No network/model inference. Calls EXISTING source-bound E1 JSON proof execution
 * and measured SOURCE BYTES (not Claude context tokens). No writes, API billing,
 * stdout credentials, claims of same-quality task completion or 5% usage.
 */
export async function runUberMindFivePercentPreflight({root=process.cwd()}={}){
 if(typeof root!=='string'||!root.trim())throw new TypeError('nonempty-repository-root-required');
 const at=resolve(root);
 const local=spawnSync('git',['rev-parse','HEAD'],{
   cwd:at,timeout:2000,encoding:'utf8',env:{PATH:process.env.PATH??'/usr/bin:/bin'}
 });
 const head=local.status===0&&/^[a-f0-9]{40}$/.test((local.stdout??'').trim())
   ?local.stdout.trim():null;
 const [ctx,exact]=await Promise.all([
   auditDirectClaudeImports({repoRoot:at}),
   Promise.resolve().then(()=>runUberMindLiveSourceWork({root:at}))
 ]);
 const lowerBound=calculateUberMindFivePercent();
 return {
  schemaVersion:UBERMIND_FIVE_PERCENT_PREFLIGHT_SCHEMA,
  sourceHeadObserved:head,
  projectClaudeDirectImports:ctx.directImportCount,
  projectClaudeDirectImportSourceBytes:ctx.rootPlusDirectImportBytes,
  projectClaudeProviderContextTokensObserved:null,
  nativeExactSourceWorkStatus:exact.status,
  nativeExactSourceWorkVerified:exact.ok===true,
  nativeExactSourceWorkObligations:exact.ok?exact.materializedOutputCount:0,
  nativeExactSourceBatchDigest:exact.ok?exact.sourceBatchDigest:null,
  nativeExactSourceScope:'EXISTING_ALLOWLISTED_PUBLIC_JSON_POINTERS_ONLY',
  novelTaskFrontierQualityProven:false,
  fivePercentNecessaryReusableMeterShareNoOverhead:lowerBound.minimumRequiredReuseShare,
  targetFiveHourUsagePercent:5,
  actualFiveHourUsagePercent:null,
  acceptedQualityParityForArbitraryTasksVerified:false,
  actualBillingUsd:0,
  providerCallsPerformed:0,paidInferenceAuthorized:false,
  externalEffectAuthority:'NONE',
  suggestedNextAction:'Claude: use exact source proof only when task contract and source scope truly match; keep normal/Opus reasoning for remaining novel high-stakes work, measure entire session via /usage when supported.',
  truth:'A real local source verifier and startup byte auditor ran. This does not imply a 95% share of arbitrary Claude work is reused, nor show any actual Claude Pro quota savings.'
 };
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 runUberMindFivePercentPreflight({root:process.cwd()})
  .then(result=>{process.stdout.write(JSON.stringify(result,null,2)+'\n');})
  .catch(err=>{process.stderr.write('UBERMIND_W35_LOCAL_PREFLIGHT_INCOMPLETE\n');process.exitCode=1;});
}