import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { redactSecrets } from './secret-patterns.mjs';
import { executeFrontierMember } from './frontier-reasoning-runtime.mjs';
import { buildFrontierCognitiveReceipt } from './frontier-cognitive-fabric.mjs';

export const FRONTIER_COUNCIL_RUNTIME_VERSION = 'uberbond.frontier-council-runtime-1.0.0';
const MAX_PHASE_TEXT = 20_000;
const MAX_UNRESOLVED = 32;
function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function envelope(extra = {}) { return { policyVersion: FRONTIER_COUNCIL_RUNTIME_VERSION, businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra }; }
function failure(reasonCodes, status = 'FRONTIER_COUNCIL_EXECUTION_BLOCKED', extra = {}) { return envelope({ ok: false, status, reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], ...extra }); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
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

export async function executeFrontierCouncil({ planResult, callability = [], modelExecutorFactory, maxTokens = 4_000, costCeilingCents = 100, clock = () => Date.now(), now = new Date() } = {}) {
  if (!planResult?.ok || planResult?.plan?.mode !== 'COUNCIL_MAX') return failure(['verified-council-plan-required']);
  const plan = planResult.plan;
  if (!Array.isArray(plan.responders) || plan.responders.length < 2 || !plan.adjudicator) return failure(['bounded-responders-and-adjudicator-required']);
  if (plan.status !== 'COUNCIL_DEGRADED' && plan.responders.some(item => item.profileId === plan.adjudicator.profileId)) return failure(['independent-adjudicator-required']);
  const evidenceByProfile = callabilityMap(callability);
  const independentRuns = await Promise.all(plan.responders.map(member => executeMember({
    member,
    task: phaseTask(plan, `independent-${member.profileId}`, plan.task.objective, [`plan://${planResult.planDigest}`]),
    evidence: evidenceByProfile.get(member.profileId), modelExecutorFactory, maxTokens, costCeilingCents, clock
  })));
  const independentFailure = independentRuns.find(item => !item.ok);
  if (independentFailure) return independentFailure;
  const independentPacket = independentRuns.map((run, index) => ({ profileId: plan.responders[index].profileId, resultRef: run.execution.resultRef, answer: run.resultText }));
  const packetText = safeText(independentPacket);
  if (!packetText) return failure(['independent-response-packet-invalid']);
  const adjudicatorEvidence = evidenceByProfile.get(plan.adjudicator.profileId);
  const critiqueObjective = ['Act only as the cross-critic for a frontier council.', 'Identify contradictions, unsupported claims, unique insights, evidence gaps, and uncertainty.', 'Majority agreement is not proof. Do not produce the final decision yet.', `Original objective: ${plan.task.objective}`, `Independent responses: ${packetText}`].join('\n');
  const critiqueRun = await executeMember({ member: plan.adjudicator, task: phaseTask(plan, 'cross-critique', critiqueObjective, independentRuns.map(item => item.execution.resultRef)), evidence: adjudicatorEvidence, modelExecutorFactory, maxTokens, costCeilingCents, clock });
  if (!critiqueRun.ok) return critiqueRun;
  const finalObjective = ['Act as the final independent adjudicator for a frontier council.', 'Return an evidence-weighted decision, preserve dissent and unresolved uncertainty, and never use majority as proof.', `Original objective: ${plan.task.objective}`, `Independent responses: ${packetText}`, `Cross-critique: ${critiqueRun.resultText}`].join('\n');
  const finalRun = await executeMember({ member: plan.adjudicator, task: phaseTask(plan, 'independent-adjudication', finalObjective, [...independentRuns.map(item => item.execution.resultRef), critiqueRun.execution.resultRef]), evidence: adjudicatorEvidence, modelExecutorFactory, maxTokens, costCeilingCents, clock });
  if (!finalRun.ok) return finalRun;
  const critiqueObject = parseObject(critiqueRun.resultText);
  const finalObject = parseObject(finalRun.resultText);
  const contradictions = boundedStringList(critiqueObject?.contradictions);
  const unresolved = boundedStringList(finalObject?.unresolved);
  const decision = safeText(finalObject?.decision ?? finalRun.resultText, 2000);
  if (!decision) return failure(['bounded-secret-free-adjudication-decision-required']);
  const processDigest = digest({ planDigest: planResult.planDigest, independenceInvariant: plan.independenceInvariant, responderResultRefs: independentRuns.map(item => item.execution.resultRef), critiqueResultRef: critiqueRun.execution.resultRef, adjudicationResultRef: finalRun.execution.resultRef, responderProfiles: plan.responders.map(item => item.profileId), adjudicatorProfile: plan.adjudicator.profileId });
  const verifierEvidenceRefs = [critiqueRun.execution.resultRef, `frontier-process-proof://${processDigest}`];
  const receiptResult = buildFrontierCognitiveReceipt({ planResult, executions: [...independentRuns.map(item => item.execution), finalRun.execution], contradictions, verifierEvidenceRefs, adjudication: { decision, decisionBasis: 'EVIDENCE_WEIGHTED', adjudicatorProfileId: plan.adjudicator.profileId, independentFromResponders: !plan.responders.some(item => item.profileId === plan.adjudicator.profileId), unresolved }, now });
  if (!receiptResult.ok) return failure(['council-receipt-failed', ...(receiptResult.reasonCodes || [])], 'FRONTIER_COUNCIL_RECEIPT_BLOCKED');
  return envelope({ ok: true, status: 'FRONTIER_COUNCIL_EXECUTION_COMPLETE', planDigest: planResult.planDigest, executionCount: independentRuns.length + 2, responderExecutions: independentRuns.map(item => item.execution), critiqueExecution: critiqueRun.execution, adjudicationExecution: finalRun.execution, processVerifierRef: `frontier-process-proof://${processDigest}`, receipt: receiptResult.receipt, receiptDigest: receiptResult.receiptDigest, truthBoundary: 'COUNCIL_PROCESS_IS_VERIFIED_BUT_MODEL_OUTPUT_IS_NOT_EXTERNAL_TRUTH; FIRST_PASS_IS_INDEPENDENT; MAJORITY_IS_NOT_PROOF; SEMANTIC_CLAIMS_STILL_REQUIRE_EVIDENCE' });
}
