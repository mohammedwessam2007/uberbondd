import { compileAgentCodeChangeSet, contentSha256 } from './agent-code-change-contract.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileSandwichDescendantAdmission, SANDWICH_DESCENDANT_CANON_PATH } from './sandwich-descendant-admission.mjs';
import { compileTimelineTopologyChallenge } from './timeline-topology-challenge.mjs';

export const SOVEREIGN_NATIVE_LOCAL_WORKER_VERSION = 'uberbond.sovereign-native-local-worker.v2';
const SHA40 = /^[a-f0-9]{40}$/i;
const OPS = new Set(['CREATE', 'UPDATE', 'DELETE']);
const SANDWICH_CONSTRAINT = 'sandwich-autocatalytic-descendant-genesis';
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 4000) => String(value ?? '').trim().slice(0, max);
const uniq = values => [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
function fail(reasonCodes, status = 'SOVEREIGN_NATIVE_LOCAL_WORKER_REFUSED', extra = {}) {
  return { ok:false, policyVersion:SOVEREIGN_NATIVE_LOCAL_WORKER_VERSION, status, reasonCodes:uniq(reasonCodes), businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects(), ...extra };
}
function safeRelative(value) {
  const p = text(value, 1000).replaceAll('\\','/');
  if (!p || p.startsWith('/') || p === '.' || p === '..' || p.startsWith('../') || p.includes('/../')) return null;
  return p;
}
function isSandwichGenesis(task) {
  return task?.taskClass === 'SANDWICH_DESCENDANT_GENESIS'
    && Array.isArray(task?.constraints)
    && task.constraints.includes(SANDWICH_CONSTRAINT)
    && task.constraints.includes('requirement-genesis-only-do-not-implement-same-cycle');
}

export function compileNativeWorkerModelPrompt({ task, baseRevision, context = [] } = {}) {
  const base = text(baseRevision, 80).toLowerCase();
  if (!task?.taskId || task.consequenceClass !== 'LOCAL_PREPARATION' || !SHA40.test(base)) return fail(['valid-exact-base-local-preparation-task-required']);
  const sandwichGenesis = isSandwichGenesis(task);
  const boundedContext = (Array.isArray(context) ? context : []).slice(0, 12).map(row => ({
    path:text(row?.path,1000),
    content:String(row?.content ?? '').slice(0,18_000)
  })).filter(row => row.path && row.content);
  const ordinarySchema = 'Return exactly {"decision":"CHANGE"|"STOP","summary":"...","changes":[{"operation":"CREATE"|"UPDATE"|"DELETE","path":"relative/path","content":"full file content for CREATE/UPDATE, omit for DELETE","rationale":"..."}],"reasonCodes":["..."]}.';
  const sandwichSchema = 'For SANDWICH_DESCENDANT_GENESIS return exactly {"decision":"CHANGE"|"STOP","summary":"...","timelineTopologyChallenge":{"baselineGraph":{"objective":"same terminal contract","terminalIds":["id"],"nodes":[{"id":"id","label":"...","durationMs":1,"requires":[],"boundaryClass":"...","necessity":"...","evidenceRefs":[]}]},"decision":"WORMHOLE"|"NO_VALID_SHORTCUT","name":"...","mechanismClass":"...","projectedGraph":{},"evidenceRefs":["context/evidence ref"],"transformations":[],"attemptedMechanismClasses":[],"reason":"..."},"descendantRequirement":{"name":"...","foldClass":"INTERNAL_SOURCE"|"INTERNAL_RESEARCH","canonicalGoalRefs":["exact existing canonical concept names"],"dependencies":[],"acceptanceEvidence":["SOURCE: ...","TEST: ..."],"rationale":"..."},"reasonCodes":["..."]}. Do not return file changes. The trusted compiler validates Timeline Topology first, then alone appends the admitted requirement to canon.';
  const policy = sandwichGenesis
    ? [
        'This is requirement genesis only. Discover at most one novel dependency-satisfied internal gap implied by existing canonical goals.',
        'Before admission, model the apparent dependency route and run a Timeline Topology challenge. Preserve the terminal contract. A WORMHOLE must measurably shorten the declared critical path; NO_VALID_SHORTCUT must show at least four materially different mechanism classes attempted.',
        'You cannot choose a file, edit canon directly, implement the requirement, alter tests, weaken an invariant, create founder preferences, or grant authority. Evidence-bound causal floors cannot be bypassed without explicit rebuttal evidence. The trusted compiler owns the only append surface.',
        'If no genuinely novel high-leverage internal gap is justified by the supplied exact-current context, return STOP.'
      ].join(' ')
    : 'Do not modify build, canon, sovereignty, truth/control surfaces or existing tests. Creating a new regression test is allowed only when required by the task. Prefer the smallest causal patch. If no safe justified source patch exists, return STOP.';
  return {
    ok:true,
    policyVersion:SOVEREIGN_NATIVE_LOCAL_WORKER_VERSION,
    status:'LOCAL_MODEL_PATCH_PROMPT_READY',
    system:[
      'You are UberBond native sovereign coding worker. Return JSON only.',
      'You may propose one bounded LOCAL_PREPARATION source change set. You never merge, sign, deploy, send, spend, change credentials or DNS, contact customers, or claim runtime/commercial truth.',
      sandwichGenesis ? sandwichSchema : ordinarySchema,
      'Do not provide before hashes. The trusted worker derives them from exact source.',
      policy
    ].join(' '),
    task:{
      taskId:task.taskId,
      taskClass:task.taskClass || null,
      objective:task.objective,
      targetRequirementId:task.targetRequirementId || null,
      constraints:Array.isArray(task.constraints)?task.constraints:[],
      forbiddenActions:Array.isArray(task.forbiddenActions)?task.forbiddenActions:[],
      requiredOutputs:Array.isArray(task.requiredOutputs)?task.requiredOutputs:[],
      acceptanceTests:Array.isArray(task.acceptanceTests)?task.acceptanceTests:[],
      consequenceClass:task.consequenceClass,
      exactBaseRevision:base,
      exactTruthSnapshot:task.localTruthSnapshot || null
    },
    context:boundedContext,
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    externalEffectLedger:zeroEffects()
  };
}

export function compileNativeWorkerProposal({ task, baseRevision, proposal, sourceSnapshot = {} } = {}) {
  const base = text(baseRevision,80).toLowerCase();
  if (!task?.taskId || task.consequenceClass !== 'LOCAL_PREPARATION' || !SHA40.test(base)) return fail(['valid-exact-base-local-preparation-task-required']);
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return fail(['structured-local-model-proposal-required']);
  const decision = text(proposal.decision,40).toUpperCase();
  if (decision === 'STOP') return fail(uniq(['local-model-declared-stop', ...(Array.isArray(proposal.reasonCodes)?proposal.reasonCodes:[])]), 'SOVEREIGN_NATIVE_LOCAL_WORKER_STOP');
  if (decision !== 'CHANGE') return fail(['recognized-local-model-decision-required']);

  const sandwichGenesis = isSandwichGenesis(task);
  let changes=[];
  if (sandwichGenesis) {
    if (Array.isArray(proposal.changes) && proposal.changes.length) return fail(['sandwich-genesis-file-changes-forbidden'],'SOVEREIGN_NATIVE_LOCAL_WORKER_PROPOSAL_REFUSED');
    const topology = compileTimelineTopologyChallenge(proposal.timelineTopologyChallenge);
    if (!topology.ok) return fail(['timeline-topology-challenge-required-before-sandwich-admission', ...(topology.reasonCodes || [])], 'SOVEREIGN_NATIVE_LOCAL_WORKER_PROPOSAL_REFUSED');
    const snap = sourceSnapshot[SANDWICH_DESCENDANT_CANON_PATH];
    if (snap?.exists !== true) return fail(['sandwich-canonical-source-snapshot-required'],'SOVEREIGN_NATIVE_LOCAL_WORKER_PROPOSAL_REFUSED');
    let beforeDocument;
    try { beforeDocument = JSON.parse(String(snap.content ?? '')); }
    catch { return fail(['sandwich-canonical-source-json-invalid'],'SOVEREIGN_NATIVE_LOCAL_WORKER_PROPOSAL_REFUSED'); }
    const admission = compileSandwichDescendantAdmission({beforeDocument,candidate:proposal.descendantRequirement,baseRevision:base});
    if (!admission.ok) return fail(admission.reasonCodes,'SOVEREIGN_NATIVE_LOCAL_WORKER_PROPOSAL_REFUSED');
    admission.entry.timelineTopologyEvidence = topology.trustedEvidence;
    changes=[{
      operation:'UPDATE',
      path:SANDWICH_DESCENDANT_CANON_PATH,
      beforeSha256:contentSha256(String(snap.content ?? '')),
      content:`${JSON.stringify(admission.afterDocument,null,2)}\n`,
      rationale:`Append one independently verifiable Sandwich descendant requirement ${admission.canonicalId} after a trusted Timeline Topology challenge; implementation remains forbidden in this admission cycle.`
    }];
  } else {
    const proposed = Array.isArray(proposal.changes) ? proposal.changes : [];
    if (!proposed.length) return fail(['local-model-change-required']);
    const reasons=[];
    for (let i=0;i<proposed.length;i+=1) {
      const row=proposed[i]||{};
      const operation=text(row.operation,20).toUpperCase();
      const filePath=safeRelative(row.path);
      if (!OPS.has(operation)) { reasons.push(`change-${i}-operation-invalid`); continue; }
      if (!filePath) { reasons.push(`change-${i}-path-invalid`); continue; }
      const snap=sourceSnapshot[filePath];
      const exists=snap?.exists===true;
      const before=exists?String(snap.content??''):null;
      if (operation==='CREATE' && exists) { reasons.push(`change-${i}-create-target-already-exists`); continue; }
      if ((operation==='UPDATE'||operation==='DELETE') && !exists) { reasons.push(`change-${i}-existing-source-required`); continue; }
      changes.push({
        operation,
        path:filePath,
        ...(operation==='CREATE'?{}:{beforeSha256:contentSha256(before)}),
        ...(operation==='DELETE'?{}:{content:String(row.content??'')}),
        rationale:text(row.rationale,1000)
      });
    }
    if (reasons.length) return fail(reasons,'SOVEREIGN_NATIVE_LOCAL_WORKER_PROPOSAL_REFUSED');
  }

  const verification=(Array.isArray(task.acceptanceTests)&&task.acceptanceTests.length?task.acceptanceTests:['npm run check:syntax','npm run test:deterministic']).map(String);
  const compiled=compileAgentCodeChangeSet({
    taskId:task.taskId,
    baseRevision:base,
    changes,
    verification,
    summary:text(proposal.summary,2000) || `Bounded native local-model repair for ${task.targetRequirementId || task.taskId}.`,
    consequenceClass:'LOCAL_PREPARATION'
  });
  if (!compiled?.ok) return fail(compiled?.reasonCodes || ['canonical-agent-code-change-set-refused'],'SOVEREIGN_NATIVE_LOCAL_WORKER_PROPOSAL_REFUSED');
  return {
    ok:true,
    policyVersion:SOVEREIGN_NATIVE_LOCAL_WORKER_VERSION,
    status:'SOVEREIGN_NATIVE_LOCAL_WORKER_CANDIDATE_READY',
    taskId:task.taskId,
    taskClass:task.taskClass || null,
    baseRevision:base,
    codeChangeSet:compiled,
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    externalEffectLedger:zeroEffects(),
    truthBoundary:sandwichGenesis
      ? 'The native model supplied a structured gap hypothesis and timeline-topology challenge. Trusted code validated the route challenge, then converted only the gap into one append-only canonical requirement candidate. The same attempt cannot implement that requirement. Verification, promotion, signing and deployment remain separate.'
      : 'The native worker emitted a canonical candidate only. Exact-source before hashes and task-owned acceptance tests were imposed outside the model. Promotion, signing and deployment remain separate authorities.'
  };
}
