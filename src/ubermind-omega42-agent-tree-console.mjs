/**
 * UBERMIND Ω42 | Truthful Agent-Tree console data and offline HTML rendering.
 * An additive presentation around W40/W41, never another executor or model router.
 * All caller-supplied fields are untrusted. Only the locally executed test runner
 * may set nativeTestEvidence; model/tool/provider live claims are NEVER promoted.
 */
import { createHash } from 'node:crypto';
import { compileUberMindTaskRoute } from './ubermind-w40-evidence-first-task-compiler.mjs';

export const OMEGA42_CONSOLE_SCHEMA='uberbond.ubermind.omega42.agent-tree-console.v1';
const dig=x=>typeof x==='string'&&/^sha256:[a-f0-9]{64}$/.test(x);
const safeText=(value,max=140)=>String(value??'').slice(0,max);
const esc=s=>safeText(s,2048).replace(/&/g,'&amp;').replace(/</g,'&lt;')
 .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function refused(code){return {ok:false,status:'REFUSED',reasonCodes:[code],
    modelCalls:0,paidModelSpendAuthorized:0,providerActivity:'NOT_OBSERVED',
    actualSubscriptionUsage:'UNKNOWN',externalEffectAuthority:'NONE'};}

export function compileOmega42AgentTree({contract, nativeTestEvidence=null, checkout=null}={}){
 if(!contract||typeof contract!=='object'||Array.isArray(contract))return refused('VALID_CONTRACT_REQUIRED');
 const route=compileUberMindTaskRoute(contract);
 if(!route.ok)return refused('W40_'+String(route.reason||route.status));
 if(nativeTestEvidence!==null && (
  typeof nativeTestEvidence!=='object'||Array.isArray(nativeTestEvidence)||
  nativeTestEvidence.executionOrigin!=='LOCAL_NODE_CHILD_PROCESS'||
  !Number.isSafeInteger(nativeTestEvidence.total)||nativeTestEvidence.total<=0||
  !Number.isSafeInteger(nativeTestEvidence.pass)||nativeTestEvidence.pass<0||
  !Number.isSafeInteger(nativeTestEvidence.fail)||nativeTestEvidence.fail<0||
  nativeTestEvidence.pass+nativeTestEvidence.fail>nativeTestEvidence.total||
  !dig(nativeTestEvidence.testSourceDigest)||!dig(nativeTestEvidence.receiptDigest)||
  !/^[a-f0-9]{40}$/.test(nativeTestEvidence.checkoutCommit)||
  !Array.isArray(nativeTestEvidence.testFiles)||nativeTestEvidence.testFiles.length<1||nativeTestEvidence.testFiles.length>32||
  nativeTestEvidence.testFiles.some(x=>typeof x!=='string'||x.length>200||!/^tests\/[a-z0-9_.-]+\.test\.mjs$/.test(x))
 ))return refused('INVALID_LOCAL_TEST_EVIDENCE');
 if(checkout!==null && (
  typeof checkout!=='object'||Array.isArray(checkout)||
  !/^[a-f0-9]{40}$/.test(checkout.head)||
  typeof checkout.clean!=='boolean'))return refused('INVALID_CHECKOUT');
 const testsMatch=!!nativeTestEvidence&&!!checkout&&checkout.clean===true&&
  nativeTestEvidence.checkoutCommit===checkout.head&&
  nativeTestEvidence.fail===0&&nativeTestEvidence.pass===nativeTestEvidence.total;
 const roles=[
  {role:'DIRECTOR',assignment:'ACCOUNTABLE_CHATGPT_OR_CLAUDE_SESSION',status:'HUMAN_CONTROLLED',providerCalls:0},
  {role:'JEV_LOCAL_ROUTER',assignment:'W40_EVIDENCE_FIRST_ROUTER',status:'COMPILED_NOT_EXECUTED',providerCalls:0},
  {role:'LEAD',assignment:`${route.main.model.toUpperCase()} / ${route.main.effort.toUpperCase()}`,status:'RECOMMENDATION_ONLY',providerCalls:0},
  ...route.delegates.map(d=>({role:d.name,assignment:`${d.model} / ${d.effort} / max ${d.maxTurns} turns`,status:'OPTIONAL_NOT_INVOKED',providerCalls:0})),
  {role:'EXPLORER',assignment:'BOUNDED_READ_ONLY_CODE_OR_AST_SOURCE_LOOKUP',status:'NOT_ASSIGNED',providerCalls:0},
  {role:'RESEARCHER',assignment:'BOUNDED_DOCS_AND_SPEC_EVIDENCE',status:'NOT_ASSIGNED',providerCalls:0},
  {role:'WORKTREE',assignment:route.teamEligible?'UP_TO_TWO_INDEPENDENT_SCOPES_IF_ACTUALLY_AUTHORIZED':'SOLO_DEFAULT',status:'NOT_OBSERVED',providerCalls:0},
  {role:'PEER_RECEIPT_BUS',assignment:'ONLY_AUTHORIZED_SHA_BOUND_PEER_EVIDENCE',status:'NOT_OBSERVED',providerCalls:0},
  {role:'NATIVE_QA',assignment:'LOCAL_DETERMINISTIC_TESTS',status:testsMatch?'REPORTED_SELECTED_TESTS__NOT_AUTHENTICATED':nativeTestEvidence?'INCOMPLETE_OR_UNBOUND':'NOT_RUN',providerCalls:0},
  {role:'INDEPENDENT_REVIEW',assignment:'SEPARATE_ACCEPTANCE_EVIDENCE_REQUIRED',status:'NOT_OBSERVED',providerCalls:0},
  {role:'PHOENIX_CHECKPOINT',assignment:'SOURCE_AND_RECEIPT_BOUND_HISTORY',status:'PERSISTENCE_NOT_OBSERVED',providerCalls:0}
 ];
 const report={ok:true,schema:OMEGA42_CONSOLE_SCHEMA,status:testsMatch?
  'REPORTED_SELECTED_LOCAL_TESTS__MODEL_EXECUTION_UNOBSERVED':'ARCHITECTURE_ONLY__NO_LIVE_AGENT_PROOF',
  taskDigest:contract.taskDigest,sourceDigest:contract.sourceDigest,rubricDigest:contract.rubricDigest,
  checkout:checkout?{head:checkout.head,clean:checkout.clean}:null,
  routeStatus:route.status,routeRequiredAction:route.requiredAction,teamEligible:route.teamEligible,
  roles,gates:route.gates,nativeTestEvidence:testsMatch?nativeTestEvidence:null,
  actualAgentInvocations:0,liveModelRoutingMeasured:false,realAgentParallelismMeasured:false,
  realTokenThroughputMeasured:false,nativeTestEvidenceAuthenticated:false,qualityAccepted:false,productionMerged:false,
  verifiedRevenueUsd:null,paidModelCalls:0,paidModelSpendAuthorized:0,
  actualSubscriptionUsage:'UNKNOWN',externalEffectAuthority:'NONE',
  notInferred:['Screenshot fork counts and p scores','Screenshot throughput and pricing',
    'Claimed team membership or model support','True Claude/ChatGPT quota usage',
    'Independent code review','Real production readiness','Actual revenue']};
 return {...report,reportDigest:'sha256:'+createHash('sha256').update(JSON.stringify(report)).digest('hex')};
}

/** Self-contained local visual. All displayed strings escaped. No inline JS/network. */
export function renderOmega42AgentTreeHtml(report){
 if(!report||report.ok!==true||report.schema!==OMEGA42_CONSOLE_SCHEMA)throw Error('VERIFIED_REPORT_SHAPE_REQUIRED');
 const rows=report.roles.map((r,i)=>`<article class="node"><small>${String(i+1).padStart(2,'0')} / ${esc(r.role)}</small><strong>${esc(r.assignment)}</strong><span>${esc(r.status)}</span></article>`).join('');
 const gateRows=report.gates.map(g=>`<li>${esc(g)}</li>`).join('');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UberMind Ω42 · Evidence-First Agent Tree</title>
 <style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#080f17;color:#e8f4f3;font:15px/1.6 system-ui,Arial,sans-serif}.wrap{max-width:1200px;margin:0 auto;padding:36px 22px}header{padding:22px 0;border-bottom:1px solid #284858}h1{font-size:clamp(28px,5vw,50px);letter-spacing:-.04em;margin:6px 0}h2{font-size:21px;color:#a6f1df}p,small{color:#aac3c8}.pill{display:inline-block;border:1px solid #e5ad55;color:#ffd28b;border-radius:20px;padding:3px 12px;font-size:12px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(225px,1fr));gap:15px;margin:24px 0}.node{border:1px solid #315462;background:linear-gradient(140deg,#112b36,#111b26);padding:19px;border-radius:13px;min-height:150px;display:flex;flex-direction:column;gap:10px}.node strong{color:#ddfaf0}.node span{color:#f5cc9e;font-size:12px}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:26px 0}.metric{border:1px solid #2a485a;border-radius:12px;padding:18px;background:#0d202e}.metric b{display:block;font-size:23px;color:#baf6d7}.columns{display:grid;grid-template-columns:1fr 1fr;gap:30px}.tag{color:#8edbc2;font-family:ui-monospace,monospace;font-size:12px;overflow-wrap:anywhere}.warn{border-left:3px solid #e5ad55;padding:15px;background:#24261b}li{margin-bottom:8px}@media(max-width:740px){.columns{grid-template-columns:1fr}} </style></head><body><main class="wrap">
 <header><span class="tag">UBERBOND / SOVEREIGN COGNITIVE CONTINUUM / 890 ORIGINAL IDEAS PRESERVED</span><h1>Ω42 Agent Tree</h1><span class="pill">${esc(report.status)}</span><p>Evidence-first planning and selected local test reporting. Not a live model provider dashboard.</p></header>
 <section class="metrics"><div class="metric"><small>Observed AI invocations</small><b>0</b></div><div class="metric"><small>Extra paid inference authorized</small><b>$0</b></div><div class="metric"><small>Selected native tests</small><b>${report.nativeTestEvidence?`${report.nativeTestEvidence.pass}/${report.nativeTestEvidence.total}`:'NOT RUN'}</b></div><div class="metric"><small>Subscription meter</small><b>UNKNOWN</b></div></section>
 <h2>Routing and acceptance phases</h2><section class="grid">${rows}</section><div class="columns"><section><h2>Hard gates</h2><ol>${gateRows}</ol></section><section><h2>What cannot be inferred</h2><ul>${report.notInferred.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="warn">No auto-merges, paid calls or authority upgrades. This is a source-bound artifact, not evidence that models ran.</div></section></div>
 <footer><p class="tag">Checkout ${esc(report.checkout?.head||'UNVERIFIED')} • Report ${esc(report.reportDigest)} • W40 existing canonical route • W41 cost auction remains optional</p></footer></main></body></html>`;
}
