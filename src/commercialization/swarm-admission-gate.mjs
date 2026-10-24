// PHOENIX: source-backed Wealth Swarm admission, not a worker, business, or money receipt.
export const SWARM_ID_PREFIX = 'A';
const SHA = /^[a-f0-9]{40}$/i;
const STATES = Object.freeze({NOT_STARTED:'UNVERIFIED', REVIEW:'CANDIDATE_REQUIRES_INDEPENDENT_REVIEW', ADMITTED:'ADMITTED'});
const ids = Object.freeze(Array.from({length:20},(_,i)=>`A${String(i+1).padStart(2,'0')}`));

export function validateSwarmManifest(manifest) {
  const a=manifest?.agents;
  if (!Array.isArray(a) || a.length!==20) return {ok:false,reason:'REQUIRE_EXACTLY_20_AGENTS'};
  const found=a.map(x=>x?.id);
  if (new Set(found).size!==20 || ids.some(id=>!found.includes(id))) return {ok:false,reason:'DUPLICATE_OR_MISSING_AGENT_ID'};
  if (a.some(x=>!x.branch || !x.agent_file || !x.worktree || !Array.isArray(x.outputs))) return {ok:false,reason:'INCOMPLETE_AGENT_SPEC'};
  if (new Set(a.map(x=>x.branch)).size!==20 || new Set(a.map(x=>x.worktree)).size!==20) return {ok:false,reason:'WORKTREE_OR_BRANCH_COLLISION'};
  return {ok:true,reason:'MANIFEST_VALID',ids};
}

function workerCheck(role,receipt) {
  const fails=[];
  if (!receipt || typeof receipt!=='object') return {state:STATES.NOT_STARTED,blocking:['NO_FINAL_MACHINE_RECEIPT']};
  if (receipt.id!==role.id) fails.push('WRONG_WORKER');
  if (receipt.branch!==role.branch) fails.push('WRONG_BRANCH');
  if (!SHA.test(receipt.headSha||'')) fails.push('MISSING_EXACT_HEAD');
  if (!receipt.sessionId || !receipt.runner || !receipt.model || !receipt.observedAt || !Number.isFinite(Date.parse(receipt.observedAt))) fails.push('NO_LIVE_MODEL_SESSION_ATTESTATION');
  if (!receipt.testEvidence || !Number.isInteger(receipt.testEvidence.passed) || receipt.testEvidence.passed<1 || receipt.testEvidence.failed!==0 || !receipt.testEvidence.command || !receipt.testEvidence.observationHash) fails.push('MISSING_EXACT_TEST_RECEIPT');
  if (!receipt.sourceEvidence || !Array.isArray(receipt.sourceEvidence) || receipt.sourceEvidence.length===0) fails.push('NO_PROVENANCE');
  if (!receipt.adversarialFalsifier || !receipt.phoenixPath) fails.push('NO_FALSIFIER_OR_PHOENIX');
  if (receipt.spendingUsd!==0 || receipt.externalMessages!==0 || receipt.charges!==0 || receipt.deployments!==0 || receipt.mainMerges!==0) fails.push('UNAUTHORIZED_OR_UNOBSERVED_EFFECT');
  if (receipt.claimedBankClearedProfitUsd>0 && !receipt.independentlyReconciledBankCredit) fails.push('BANK_CLEARANCE_UNVERIFIED');
  if (receipt.independentlyReviewed!==true || receipt.reviewerId===receipt.id) fails.push('INDEPENDENT_REVIEW_NOT_PROVEN');
  return {state:fails.length?STATES.REVIEW:STATES.ADMITTED,blocking:fails};
}

export function evaluateSwarmAdmission({manifest,receipts={},redTeamVerdict=null,operatorApproval=false,observedAt='UNKNOWN'}={}) {
  const valid=validateSwarmManifest(manifest);
  if (!valid.ok) return {state:'HOLD_INVALID_MANIFEST',blocking:[valid.reason],workers:{},admittedCount:0};
  const workers={};
  for(const role of manifest.agents) workers[role.id]=workerCheck(role,receipts[role.id]);
  const admissible=ids.filter(x=>workers[x].state===STATES.ADMITTED);
  const baseUnverified=ids.filter(x=>x!=='A19'&&x!=='A20'&&workers[x].state!==STATES.ADMITTED);
  const blocking=[];
  if(baseUnverified.length) blocking.push('WORKER_RECEIPTS_MISSING_OR_UNREVIEWED');
  if(workers.A19.state!==STATES.ADMITTED) blocking.push('A19_INDEPENDENT_REVIEW_INCOMPLETE');
  if(redTeamVerdict!=='PASS') blocking.push('A19_TRIBUNAL_NO_PASS');
  if(workers.A20.state!==STATES.ADMITTED) blocking.push('A20_INTEGRATION_UNVERIFIED');
  if(operatorApproval!==true) blocking.push('FINAL_OWNER_RELEASE_APPROVAL_ABSENT');
  return {schemaVersion:1,observedAt,truthClass:'LOCAL_SCHEMA_ADMISSION_NOT_LIVE_CI_OR_BANK_PROOF',state:blocking.length?'HOLD_ADMISSION':'ADMITTED_FOR_REVIEW_ONLY',blocking,admittedCount:admissible.length,unverifiedCount:20-admissible.length,workers,sourceBranchesNeverMergedByGate:true,bankClearedProfitUsd:'NOT_EVIDENCED_BY_SWARM_ADMISSION'};
}
