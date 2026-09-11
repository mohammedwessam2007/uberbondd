import { compileAgentCodeChangeSet, contentSha256 } from './agent-code-change-contract.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileSandwichDescendantAdmission, SANDWICH_DESCENDANT_CANON_PATH } from './sandwich-descendant-admission.mjs';
import { compileTimelineTopologyChallenge } from './timeline-topology-challenge.mjs';
import { compileTemporalFoundryRaid } from './temporal-foundry.mjs';
import { verifyTaskBoundContextProjection } from './context-task-binding.mjs';

export const SOVEREIGN_NATIVE_LOCAL_WORKER_VERSION = 'uberbond.sovereign-native-local-worker.v5';
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
function descendantBinding(entry) {
  return contentSha256(JSON.stringify({
    name: entry.name,
    foldClass: entry.foldClass,
    canonicalGoalRefs: entry.canonicalGoalRefs,
    dependencies: entry.dependencies,
    acceptanceEvidence: entry.acceptanceEvidence,
    rationale: entry.rationale
  }));
}

export function compileNativeWorkerModelPrompt({ task, baseRevision, context = [] } = {}) {
  const base = text(baseRevision, 80).toLowerCase();
  if (!task?.taskId || task.consequenceClass !== 'LOCAL_PREPARATION' || !SHA40.test(base)) return fail(['valid-exact-base-local-preparation-task-required']);
  const contextGate = verifyTaskBoundContextProjection(task.contextBinding, { taskId:task.taskId, taskClass:task.taskClass || null, objective:task.objective || null, audience:'isolated-worker', sourceCommit:base });
  if (!contextGate.ok) return fail(['verified-task-bound-context-required', ...(contextGate.reasonCodes || [])]);
  const sandwichGenesis = isSandwichGenesis(task);
  const boundedContext = (Array.isArray(context) ? context : []).slice(0, 11).map(row => ({
    path:text(row?.path,1000),
    content:String(row?.content ?? '').slice(0,18_000)
  })).filter(row => row.path && row.content);
  boundedContext.unshift({path:'context:task-bound-brainstate',content:JSON.stringify(task.contextBinding).slice(0,18_000)});
  const ordinarySchema = 'Return exactly {"decision":"CHANGE"|"STOP","summary":"...","changes":[{"operation":"CREATE"|"UPDATE"|"DELETE","path":"relative/path","content":"full file content for CREATE/UPDATE, omit for DELETE","rationale":"..."}],"reasonCodes":["..."]}.';
  const sandwichSchema = 'For SANDWICH_DESCENDANT_GENESIS return exactly {"decision":"CHANGE"|"STOP","summary":"...","temporalFoundry":{"futureCapability":{"futureCapabilityName":"...","terminalContract":"...","horizonLabel":"...","terminalFunctionIds":["id"],"functions":[{"id":"id","label":"...","weight":1,"requires":[],"realizationState":"PRESENT_VERIFIED|PRESENT_COMPOSABLE|INTERNAL_PRIMITIVE_MISSING|EXTERNAL_OR_PHYSICAL_FLOOR|UNKNOWN","evidenceRefs":[]}]},"primitiveCandidate":{"requirementName":"exact descendantRequirement.name","name":"...","unlockFunctionIds":["id"],"evidenceRefs":["context/evidence ref"],"rationale":"..."}},"timelineTopologyChallenge":{"subjectRequirementName":"exact descendantRequirement.name","baselineGraph":{"objective":"same terminal contract","terminalIds":["id"],"nodes":[{"id":"id","label":"...","durationMs":1,"requires":[],"boundaryClass":"...","necessity":"...","evidenceRefs":[]}]},"decision":"WORMHOLE|NO_VALID_SHORTCUT","name":"...","mechanismClass":"...","projectedGraph":{},"evidenceRefs":["context/evidence ref"],"transformations":[],"attemptedMechanismClasses":[],"reason":"..."},"descendantRequirement":{"name":"...","foldClass":"INTERNAL_SOURCE|INTERNAL_RESEARCH","canonicalGoalRefs":["exact existing canonical concept names"],"dependencies":[],"acceptanceEvidence":["SOURCE: ...","TEST: ..."],"rationale":"..."},"reasonCodes":["..."]}. Do not return file changes. Temporal Foundry primitiveCandidate.requirementName and topology subjectRequirementName must both exactly equal descendantRequirement.name. Trusted code validates future-function capture first, topology second, binds both receipts to the exact admitted requirement digest, then alone appends the requirement to canon.';
  const policy = sandwichGenesis
    ? [
        'This is requirement genesis only. Discover at most one novel dependency-satisfied internal gap implied by existing canonical goals.',
        'First run Temporal Foundry: decompose a stronger future-labeled UberBond capability into evidence-backed functions, measure what is already present/composable, preserve external/physical/unknown functions as uncaptured, and select one dependency-satisfied internal enabling primitive that increases present function capture.',
        'Then run Timeline Topology against that same primitive. Preserve the terminal contract. A WORMHOLE must measurably shorten the declared critical path; NO_VALID_SHORTCUT must show at least four materially different mechanism classes attempted.',
        'Both analyses must explicitly name the exact descendant requirement. The trusted worker refuses replay/substitution and cryptographically binds both trusted receipts to the normalized admitted requirement.',
        'You cannot choose a file, edit canon directly, implement the requirement, alter tests, weaken an invariant, create founder preferences, or grant authority. Future horizon labels are not duration evidence. Physical/external functions and evidence-bound causal floors cannot be bypassed by declaration.',
        'If no genuinely novel high-leverage internal gap is justified by the supplied exact-current context, return STOP.'
      ].join(' ')
    : 'Do not modify build, canon, sovereignty, truth/control surfaces or existing tests. Creating a new regression test is allowed only when required by the task. Prefer the smallest causal patch. If no safe justified source patch exists, return STOP.';
  return {
    ok:true,
    policyVersion:SOVEREIGN_NATIVE_LOCAL_WORKER_VERSION,
    status:'LOCAL_MODEL_PATCH_PROMPT_READY',
    contextBindingId:contextGate.bindingId,
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
      exactTruthSnapshot:task.localTruthSnapshot || null,
      contextBindingId:contextGate.bindingId
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
    const temporal = compileTemporalFoundryRaid(proposal.temporalFoundry);
    if (!temporal.ok) return fail(['temporal-foundry-raid-required-before-sandwich-admission', ...(temporal.reasonCodes || [])], 'SOVEREIGN_NATIVE_LOCAL_WORKER_PROPOSAL_REFUSED');
    const temporalSubject = text(proposal.temporalFoundry?.primitiveCandidate?.requirementName,180);
    const descendantSubject = text(proposal.descendantRequirement?.name,180);
    if (!temporalSubject || !descendantSubject || temporalSubject !== descendantSubject) {
      return fail(['temporal-foundry-subject-must-match-descendant-requirement'],'SOVEREIGN_NATIVE_LOCAL_WORKER_PROPOSAL_REFUSED');
    }
    const topology = compileTimelineTopologyChallenge(proposal.timelineTopologyChallenge);
    if (!topology.ok) return fail(['timeline-topology-challenge-required-before-sandwich-admission', ...(topology.reasonCodes || [])], 'SOVEREIGN_NATIVE_LOCAL_WORKER_PROPOSAL_REFUSED');
    const topologySubject = text(proposal.timelineTopologyChallenge?.subjectRequirementName,180);
    if (!topologySubject || topologySubject !== descendantSubject) {
      return fail(['timeline-topology-subject-must-match-descendant-requirement'],'SOVEREIGN_NATIVE_LOCAL_WORKER_PROPOSAL_REFUSED');
    }
    const snap = sourceSnapshot[SANDWICH_DESCENDANT_CANON_PATH];
    if (snap?.exists !== true) return fail(['sandwich-canonical-source-snapshot-required'],'SOVEREIGN_NATIVE_LOCAL_WORKER_PROPOSAL_REFUSED');
    let beforeDocument;
    try { beforeDocument = JSON.parse(String(snap.content ?? '')); }
    catch { return fail(['sandwich-canonical-source-json-invalid'],'SOVEREIGN_NATIVE_LOCAL_WORKER_PROPOSAL_REFUSED'); }
    const admission = compileSandwichDescendantAdmission({beforeDocument,candidate:proposal.descendantRequirement,baseRevision:base});
    if (!admission.ok) return fail(admission.reasonCodes,'SOVEREIGN_NATIVE_LOCAL_WORKER_PROPOSAL_REFUSED');
    const binding=descendantBinding(admission.entry);
    admission.entry.temporalFoundryEvidence = {
      ...temporal.trustedEvidence,
      subjectRequirementName: admission.entry.name,
      subjectRequirementSha256: binding
    };
    admission.entry.timelineTopologyEvidence = {
      ...topology.trustedEvidence,
      subjectRequirementName: admission.entry.name,
      subjectRequirementSha256: binding
    };
    changes=[{
      operation:'UPDATE',
      path:SANDWICH_DESCENDANT_CANON_PATH,
      beforeSha256:contentSha256(String(snap.content ?? '')),
      content:`${JSON.stringify(admission.afterDocument,null,2)}\n`,
      rationale:`Append one independently verifiable Sandwich descendant requirement ${admission.canonicalId} after trusted Temporal Foundry future-function capture and Timeline Topology challenge, both cryptographically bound to the exact admitted requirement; implementation remains forbidden in this admission cycle.`
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
      ? 'The native model supplied a future-function pull-forward hypothesis, a structured descendant gap and a timeline-topology challenge. Trusted code validated Temporal Foundry first, validated the route challenge second, required exact subject identity, cryptographically bound both trusted receipts to the normalized admitted requirement, then converted only that gap into one append-only canonical requirement candidate. The same attempt cannot implement that requirement. Verification, promotion, signing and deployment remain separate.'
      : 'The native worker emitted a canonical candidate only. Exact-source before hashes and task-owned acceptance tests were imposed outside the model. Promotion, signing and deployment remain separate authorities.'
  };
}
