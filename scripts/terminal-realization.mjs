#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeCurrentTruthRegeneration } from './current-truth-regeneration.mjs';
import { compileExecutionLeafContinuation } from '../src/execution-leaf-continuation.mjs';
import { verifyRecursiveGovernancePrincipals } from '../src/recursive-governance-principals.mjs';
import { compileFiniteClosureTribunal } from '../src/finite-closure-tribunal.mjs';
import { compileTerminalSemanticRefusalHandoff } from '../src/terminal-semantic-refusal-handoff.mjs';
import { loadRestartRecoveryRuntimeEvidence } from '../src/runtime-proof-ingestion.mjs';
import { applyRuntimeCutEvidenceOverlay } from '../src/runtime-cut-evidence-overlay.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const readJson=path=>JSON.parse(readFileSync(join(root,path),'utf8'));
const readJsonMaybe=path=>{try{return readJson(path);}catch{return null;}};
function run(script){
  const result=spawnSync(process.execPath,[script],{cwd:root,env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
  return{script,exitCode:result.status??1,error:result.error?String(result.error.message||result.error):null};
}
function refuse(reasonCodes,detail={}){return{ok:false,status:'TERMINAL_REALIZATION_REFUSED',reasonCodes:[...new Set(reasonCodes)],detail,businessEffectAuthority:'NONE',externalEffectLedger:{customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0}};}
function persist(output){mkdirSync(join(root,'artifacts/sovereign'),{recursive:true});writeFileSync(join(root,'artifacts/sovereign/terminal-realization.json'),`${JSON.stringify(output,null,2)}\n`,'utf8');return output;}

export function executeTerminalRealization(){
  const truthReceipt=executeCurrentTruthRegeneration();
  if(!truthReceipt.ok)return persist({...refuse(['current-truth-regeneration-failed'],{truthReceipt}),sourceCommit:truthReceipt?.headSha||null,finiteEngineeringClosure:'INCOMPLETE',finiteOpenRequirements:[],generatedAt:new Date().toISOString(),generator:'scripts/terminal-realization.mjs'});
  const runs=[run('scripts/semantic-requirement-tribunal.mjs'),run('scripts/composed-effect-authority-audit.mjs'),run('scripts/sovereign-cut-set-audit.mjs')];
  const semanticTribunal=readJsonMaybe('artifacts/sovereign/semantic-requirement-tribunal.json');
  const sinkAuthorityReport=readJsonMaybe('artifacts/sovereign/composed-effect-authority-audit.json');
  const cutSetReport=readJsonMaybe('artifacts/sovereign/sovereign-cut-set-audit.json');
  const restartRuntimeEvidence=loadRestartRecoveryRuntimeEvidence({path:process.env.UBERBOND_RESTART_RECOVERY_RECEIPT_PATH||'',expectedSourceCommit:truthReceipt.headSha});
  const effectiveCutSetReport=applyRuntimeCutEvidenceOverlay({cutSetReport,restartRecoveryEvidence:restartRuntimeEvidence});
  const failed=runs.filter(r=>r.exitCode!==0);
  if(failed.length){
    const semanticRun=runs.find(r=>r.script==='scripts/semantic-requirement-tribunal.mjs');
    if(semanticRun?.exitCode!==0&&semanticTribunal){
      const handoff=compileTerminalSemanticRefusalHandoff({truthReceipt,semanticTribunal,runs,sinkAuthorityReport,cutSetReport:effectiveCutSetReport});
      if(handoff.status==='TERMINAL_REALIZATION_REFUSED')return persist({...handoff,generatedAt:new Date().toISOString(),generator:'scripts/terminal-realization.mjs'});
    }
    return persist({...refuse(['terminal-source-tribunal-generator-failed'],{runs,semanticArtifactCurrent:Boolean(semanticTribunal&&semanticTribunal.sourceCommit===truthReceipt.headSha)}),sourceCommit:truthReceipt.headSha,finiteEngineeringClosure:'INCOMPLETE',finiteOpenRequirements:[],generatedAt:new Date().toISOString(),generator:'scripts/terminal-realization.mjs'});
  }
  if(!semanticTribunal||!sinkAuthorityReport||!cutSetReport)return persist({...refuse(['terminal-source-tribunal-artifact-missing'],{runs}),sourceCommit:truthReceipt.headSha,finiteEngineeringClosure:'INCOMPLETE',finiteOpenRequirements:[],generatedAt:new Date().toISOString(),generator:'scripts/terminal-realization.mjs'});
  const executionGraph=readJson('artifacts/sovereign/canonical-execution-leaf-graph.json');
  const continuationProof=compileExecutionLeafContinuation({graph:executionGraph,maxAttempts:3});
  const principalDeclaration=readJson('config/recursive-governance-principals.json');
  const recursiveGovernanceReport=verifyRecursiveGovernancePrincipals({generations:principalDeclaration.generations});
  const tribunal=compileFiniteClosureTribunal({
    truthReceipt,semanticTribunal,executionGraph,continuationProof,sinkAuthorityReport,recursiveGovernanceReport,cutSetReport:effectiveCutSetReport,
    namedRuntimeStatus:'NOT_MEASURED',
    observedAutonomyStatus:'ELAPSED_EVIDENCE_PENDING',
    externalCommercialStatus:'NO_REAL_CUSTOMERS_OR_CLEARED_REVENUE',
    personalRealityStatus:'LONGITUDINAL_EVIDENCE_PENDING',
    asiEvidenceStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    openEndedFrontierStatus:'OPEN'
  });
  const output={...tribunal,generatedAt:new Date().toISOString(),generator:'scripts/terminal-realization.mjs',componentReceipts:{currentTruth:truthReceipt,semanticTribunal:{ok:semanticTribunal.ok,status:semanticTribunal.status,receiptDigest:semanticTribunal.receiptDigest},continuation:{ok:continuationProof.ok,status:continuationProof.status,graphDigest:executionGraph.graphDigest},effectAuthority:{ok:sinkAuthorityReport.ok,status:sinkAuthorityReport.status,receiptDigest:sinkAuthorityReport.receiptDigest},recursiveGovernance:{ok:recursiveGovernanceReport.ok,status:recursiveGovernanceReport.status,receiptDigest:recursiveGovernanceReport.receiptDigest,truthBoundary:recursiveGovernanceReport.truthBoundary},cutSets:{ok:effectiveCutSetReport.ok,status:effectiveCutSetReport.status,receiptDigest:effectiveCutSetReport.receiptDigest,runtimeProofRequiredCuts:effectiveCutSetReport.runtimeProofRequiredCuts,externalProviderCuts:effectiveCutSetReport.externalProviderCuts,ownerCustodyCuts:effectiveCutSetReport.ownerCustodyCuts,runtimeEvidenceOverlay:effectiveCutSetReport.runtimeEvidenceOverlay}},truthBoundary:'TERMINAL_REALIZATION IS A FINITE ENGINEERING TRIBUNAL. IT MUST NEVER REWRITE ABSENT RUNTIME, OWNER, PROVIDER, CUSTOMER, REVENUE, LIFE-OUTCOME OR ASI EVIDENCE AS COMPLETE.'};
  return persist(output);
}

const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){const result=executeTerminalRealization();process.stdout.write(`${JSON.stringify({ok:result.ok,status:result.status,finiteEngineeringClosure:result.separatedStatus?.FINITE_ENGINEERING_CLOSURE||result.finiteEngineeringClosure||'INCOMPLETE',reasonCodes:result.reasonCodes||[],finiteOpenRequirements:Array.isArray(result.finiteOpenRequirements)?result.finiteOpenRequirements.length:0,semanticDiagnostics:result.semanticDiagnostics||null,runtimeProofRequiredCuts:result.componentReceipts?.cutSets?.runtimeProofRequiredCuts||[],runtimeEvidenceOverlay:result.componentReceipts?.cutSets?.runtimeEvidenceOverlay||null,externalProviderCuts:result.componentReceipts?.cutSets?.externalProviderCuts||[],ownerCustodyCuts:result.componentReceipts?.cutSets?.ownerCustodyCuts||[],output:'artifacts/sovereign/terminal-realization.json'},null,2)}\n`);if(!result.ok)process.exitCode=2;}
