import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { redactSecrets } from './secret-patterns.mjs';
import { executeFrontierMember } from './frontier-reasoning-runtime.mjs';
import { buildFrontierCognitiveReceipt } from './frontier-cognitive-fabric.mjs';

export const FRONTIER_COUNCIL_RUNTIME_VERSION = 'uberbond.frontier-council-runtime-1.2.1';
const MAX_PHASE_TEXT = 20_000;
const MAX_UNRESOLVED = 32;
function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function envelope(extra = {}) { return { policyVersion: FRONTIER_COUNCIL_RUNTIME_VERSION, businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra }; }
function failure(reasonCodes, status = 'FRONTIER_COUNCIL_EXECUTION_BLOCKED', extra = {}) { return envelope({ ok: false, status, reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], ...extra }); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) { const n = Number(value); return Number.isSafeInteger(n) && n >= min && n <= max ? n : null; }
function safeText(value, max = MAX_PHASE_TEXT) {
  let raw;
  try { raw = typeof value === 'string' ? value : JSON.stringify(value); } catch { return null; }
  raw = String(raw ?? '').trim();
  return raw && raw.length <= max && redactSecrets(raw) === raw ? raw : null;
}
function callabilityMap(items = []) { return new Map((Array.isArray(items) ? items : []).map(item => [String(item?.profileId || '').toLowerCase(), item])); }
function phaseTask(plan, phaseId, objective, evidenceRefs = []) { return { taskId: `${plan.task.taskId}:${phaseId}`, objective, consequenceClass: 'LOCAL_PREPARATION', contextRefs: [...plan.contextPacket.contextRefs], evidenceRefs: [...evidenceRefs] }; }
async function executeMember({ member, task, evidence, modelExecutorFactory, maxTokens, costCeilingCents, clock }) {
  if (!evidence) return failure([`callability-evidence-missing:${member.profileId}`]);
  const out = await executeFrontierMember({ member, task, modelExecutorFactory, callabilityEvidence: evidence, maxTokens, costCeilingCents, clock });
  if (!out.ok) return failure([`council-member-execution-failed:${member.profileId}`, ...(out.reasonCodes || [])], out.status || 'FRONTIER_COUNCIL_EXECUTION_FAILED');
  const resultText = safeText(out.ephemeralResult);
  if (!resultText) return failure([`bounded-secret-free-ephemeral-result-required:${member.profileId}`]);
  return envelope({ ok: true, status: 'FRONTIER_COUNCIL_MEMBER_COMPLETE', execution: out.execution, resultText });
}
function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null; } catch { return null; }
}
function boundedStringList(value) { return !Array.isArray(value) || value.length > MAX_UNRESOLVED ? [] : value.map(item => safeText(item, 1000)).filter(Boolean); }
function sumCost(runs = []) { return runs.reduce((sum, run) => sum + Number(run?.execution?.costCents || 0), 0); }
function uniqueStrings(values = []) { return [...new Set(values.filter(Boolean))]; }

export async function executeFrontierCouncil({ planResult, callability = [], modelExecutorFactory, maxTokens = 4_000, costCeilingCents = 100, clock = () => Date.now(), now = new Date() } = {}) {
  if (!planResult?.ok || planResult?.plan?.mode !== 'COUNCIL_MAX') return failure(['verified-council-plan-required']);
  const plan = planResult.plan;
  if (!Array.isArray(plan.responders) || plan.responders.length < 2 || !plan.adjudicator) return failure(['bounded-responders-and-adjudicator-required']);
  if (plan.status !== 'COUNCIL_DEGRADED' && plan.responders.some(item => item.profileId === plan.adjudicator.profileId)) return failure(['independent-adjudicator-required']);
  const totalBudget = integer(costCeilingCents, 0, 10_000_000);
  if (totalBudget == null) return failure(['bounded-shared-council-budget-required']);
  const responderCount = plan.responders.length;
  const totalCalls = responderCount * 2 + 1;
  const firstPassReservation = Math.floor(totalBudget / totalCalls);
  const evidenceByProfile = callabilityMap(callability);

  // Phase 1: every responder works independently. No peer output exists in these tasks.
  const independentRuns = await Promise.all(plan.responders.map(member => executeMember({
    member,
    task: phaseTask(plan, `independent-${member.profileId}`, plan.task.objective, [`plan://${planResult.planDigest}`]),
    evidence: evidenceByProfile.get(member.profileId), modelExecutorFactory, maxTokens, costCeilingCents: firstPassReservation, clock
  })));
  const independentFailure = independentRuns.find(item => !item.ok);
  if (independentFailure) return independentFailure;
  let spentCents = sumCost(independentRuns);
  if (spentCents > totalBudget) return failure(['shared-council-budget-exceeded-after-independent-phase'], 'FRONTIER_COUNCIL_BUDGET_EXCEEDED', { spentCents, costCeilingCents: totalBudget });

  const independentPacket = independentRuns.map((run, index) => ({ profileId: plan.responders[index].profileId, resultRef: run.execution.resultRef, answer: run.resultText }));
  const packetText = safeText(independentPacket);
  if (!packetText) return failure(['independent-response-packet-invalid']);

  // Phase 2: after every first pass is complete, each responder critiques the council.
  // This is deliberate contamination only in the critique phase, never in first-pass work.
  const critiqueReservation = Math.floor((totalBudget - spentCents) / (responderCount + 1));
  const independentRefs = independentRuns.map(item => item.execution.resultRef);
  const critiqueRuns = await Promise.all(plan.responders.map((member, index) => {
    const own = independentPacket[index];
    const peers = independentPacket.filter(item => item.profileId !== member.profileId);
    const peerText = safeText(peers);
    const ownText = safeText(own);
    if (!peerText || !ownText) return Promise.resolve(failure([`cross-critique-packet-invalid:${member.profileId}`]));
    const objective = [
      'Act as a bounded cross-critic inside a frontier council. Your first-pass answer is already sealed.',
      'Critique the peer answers against the original objective and your own independent answer.',
      'Extract contradictions, unsupported claims, evidence gaps, unique useful insights and unresolved uncertainty.',
      'Majority agreement is not proof. Do not produce the final council decision.',
      `Original objective: ${plan.task.objective}`,
      `Your sealed first pass: ${ownText}`,
      `Peer first passes: ${peerText}`
    ].join('\n');
    return executeMember({
      member,
      task: phaseTask(plan, `cross-critique-${member.profileId}`, objective, independentRefs),
      evidence: evidenceByProfile.get(member.profileId),
      modelExecutorFactory,
      maxTokens,
      costCeilingCents: critiqueReservation,
      clock
    });
  }));
  const critiqueFailure = critiqueRuns.find(item => !item.ok);
  if (critiqueFailure) return critiqueFailure;
  spentCents += sumCost(critiqueRuns);
  if (spentCents > totalBudget) return failure(['shared-council-budget-exceeded-after-cross-critique'], 'FRONTIER_COUNCIL_BUDGET_EXCEEDED', { spentCents, costCeilingCents: totalBudget });

  const critiquePacket = critiqueRuns.map((run, index) => ({ profileId: plan.responders[index].profileId, resultRef: run.execution.resultRef, critique: run.resultText }));
  const critiquePacketText = safeText(critiquePacket);
  if (!critiquePacketText) return failure(['cross-critique-response-packet-invalid']);

  // Phase 3: a distinct adjudicator sees the sealed answers and all cross-critiques.
  const adjudicatorEvidence = evidenceByProfile.get(plan.adjudicator.profileId);
  const finalObjective = [
    'Act as the final independent adjudicator for a frontier council.',
    'Return an evidence-weighted decision, preserve dissent and unresolved uncertainty, and never use majority as proof.',
    'Treat responder critiques as process evidence, not external truth.',
    `Original objective: ${plan.task.objective}`,
    `Independent responses: ${packetText}`,
    `Responder cross-critiques: ${critiquePacketText}`
  ].join('\n');
  const finalBudget = totalBudget - spentCents;
  const finalRun = await executeMember({
    member: plan.adjudicator,
    task: phaseTask(plan, 'independent-adjudication', finalObjective, [...independentRefs, ...critiqueRuns.map(item => item.execution.resultRef)]),
    evidence: adjudicatorEvidence,
    modelExecutorFactory,
    maxTokens,
    costCeilingCents: finalBudget,
    clock
  });
  if (!finalRun.ok) return finalRun;
  spentCents += Number(finalRun.execution.costCents || 0);
  if (spentCents > totalBudget) return failure(['shared-council-budget-exceeded-after-adjudication'], 'FRONTIER_COUNCIL_BUDGET_EXCEEDED', { spentCents, costCeilingCents: totalBudget });

  const contradictions = uniqueStrings(critiqueRuns.flatMap(run => boundedStringList(parseObject(run.resultText)?.contradictions)));
  const finalObject = parseObject(finalRun.resultText);
  const unresolved = boundedStringList(finalObject?.unresolved);
  const decision = safeText(finalObject?.decision ?? finalRun.resultText, 2000);
  if (!decision) return failure(['bounded-secret-free-adjudication-decision-required']);
  const critiqueResultRefs = critiqueRuns.map(item => item.execution.resultRef);
  const processDigest = digest({
    planDigest: planResult.planDigest,
    independenceInvariant: plan.independenceInvariant,
    responderResultRefs: independentRefs,
    critiqueResultRefs,
    adjudicationResultRef: finalRun.execution.resultRef,
    responderProfiles: plan.responders.map(item => item.profileId),
    adjudicatorProfile: plan.adjudicator.profileId,
    costCeilingCents: totalBudget,
    spentCents
  });
  const processVerifierRef = `frontier-process-proof://${processDigest}`;
  const receiptResult = buildFrontierCognitiveReceipt({
    planResult,
    executions: [...independentRuns.map(item => item.execution), finalRun.execution],
    contradictions,
    verifierEvidenceRefs: [...critiqueResultRefs, processVerifierRef],
    adjudication: {
      decision,
      decisionBasis: 'EVIDENCE_WEIGHTED',
      adjudicatorProfileId: plan.adjudicator.profileId,
      independentFromResponders: !plan.responders.some(item => item.profileId === plan.adjudicator.profileId),
      unresolved
    },
    now
  });
  if (!receiptResult.ok) return failure(['council-receipt-failed', ...(receiptResult.reasonCodes || [])], 'FRONTIER_COUNCIL_RECEIPT_BLOCKED');
  const critiqueExecutions = critiqueRuns.map(item => structuredClone(item.execution));
  const receipt = {
    ...receiptResult.receipt,
    councilBudgetCents: totalBudget,
    councilSpentCents: spentCents,
    crossCritiqueProfiles: plan.responders.map(item => item.profileId),
    critiqueExecutions,
    budgetInvariant: 'ONE_SHARED_COUNCIL_BUDGET_COVERS_ALL_FIRST_PASSES_CROSS_CRITIQUES_AND_ADJUDICATION; NO_CALL_RECEIVES_THE_FULL_MISSION_CEILING'
  };
  return envelope({
    ok: true,
    status: 'FRONTIER_COUNCIL_EXECUTION_COMPLETE',
    planDigest: planResult.planDigest,
    executionCount: independentRuns.length + critiqueRuns.length + 1,
    responderExecutions: independentRuns.map(item => item.execution),
    critiqueExecutions,
    adjudicationExecution: finalRun.execution,
    processVerifierRef,
    costCeilingCents: totalBudget,
    spentCents,
    receipt,
    receiptDigest: digest(receipt),
    truthBoundary: 'COUNCIL_PROCESS_IS_DETERMINISTICALLY_VERIFIED_BUT_MODEL_SEMANTICS_ARE_NOT_EXTERNAL_TRUTH; FIRST_PASSES_ARE_INDEPENDENT; RESPONDERS_CROSS_CRITIQUE_ONLY_AFTER_ALL_FIRST_PASSES; ADJUDICATOR_IS_DISTINCT; MAJORITY_IS_NOT_PROOF; ONE_SHARED_BUDGET_GOVERNS_ALL_COUNCIL_CALLS'
  });
}
