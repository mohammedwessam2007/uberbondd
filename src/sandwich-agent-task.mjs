import { compileAgentTask } from './agent-relay.mjs';

export const SANDWICH_AGENT_TASK_VERSION = 'uberbond.sandwich-agent-task.v1.0.0';

const ZERO_EFFECTS = Object.freeze({
  customerMessages: 0,
  providerCalls: 0,
  spendCents: 0,
  deployments: 0,
  dnsChanges: 0,
  credentialChanges: 0,
  paymentMutations: 0,
  productionMutations: 0
});

const fail = reasonCodes => ({
  ok: false,
  status: 'SANDWICH_AGENT_TASK_REFUSED',
  version: SANDWICH_AGENT_TASK_VERSION,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: { ...ZERO_EFFECTS }
});

export function compileSandwichAgentTask({ sandwich = null, foldMission = null, date = new Date() } = {}) {
  const mission = foldMission?.mission;
  const reasons = [];
  if (!sandwich?.ok || sandwich.status !== 'SANDWICH_FOLD_READY' || !sandwich.nextFold) reasons.push('ready-sandwich-required');
  if (!foldMission?.ok || foldMission.status !== 'SANDWICH_FOLD_MISSION_READY' || !mission) reasons.push('ready-fold-mission-required');
  if (mission && sandwich) {
    if (mission.sourceCommit !== sandwich.currentSourceCommit) reasons.push('mission-source-mismatch');
    if (mission.sandwichDigest !== sandwich.sandwichDigest) reasons.push('mission-sandwich-digest-mismatch');
    if (mission.targetDigest !== sandwich.upperSlice?.targetDigest) reasons.push('mission-target-digest-mismatch');
    if (mission.gapId !== sandwich.nextFold?.id) reasons.push('mission-gap-mismatch');
    if (!['INTERNAL_SOURCE', 'INTERNAL_RESEARCH'].includes(mission.foldClass)) reasons.push('only-internal-folds-may-compile-to-authoring-task');
  }
  if (reasons.length) return fail(reasons);

  const base = sandwich.currentSourceCommit;
  const taskId = `uberbond_sandwich_${base.slice(0, 16)}_${mission.gapId.replace(/[^a-z0-9_.-]+/gi, '-').slice(0, 80)}`;
  const objective = `On exact UberBond source ${base}, perform exactly one Sandwich Method fold for gap ${mission.gapId}: ${mission.objective}. Work only on this bounded internal ${mission.foldClass} gap. Preserve every stronger current behavior and all authority/privacy/truth boundaries. The result is candidate source/research evidence only until independently verified and promoted by existing authority. If the target is already satisfied, invalidated, genuinely external, or no safe source change is justified, return STOP with evidence rather than manufacturing work.`;

  const compiled = compileAgentTask({
    taskId,
    objective,
    originAgent: 'uberbond-sandwich-controller',
    targetAgent: 'claude-code',
    parentTask: `sandwich:${sandwich.sandwichDigest}`,
    contextRefs: [
      `main:${base}`,
      `sandwich:${sandwich.sandwichDigest}`,
      `descendant:${sandwich.upperSlice.targetDigest}`,
      `fold:${mission.gapId}`,
      ...mission.executionRequirementIds.map(id => `canonical-requirement:${id}`)
    ],
    evidenceRefs: [
      `evidence:exact-source-${base}`,
      `evidence:sandwich-target-${sandwich.upperSlice.targetDigest}`,
      ...sandwich.nextFold.evidenceRefs
    ],
    constraints: [
      `exact-base-revision:${base}`,
      'sandwich-fold-mode',
      `sandwich-gap:${mission.gapId}`,
      `sandwich-fold-class:${mission.foldClass}`,
      'one-bounded-change-set',
      'local-preparation-only',
      'business-effect-authority:none',
      'external-effect-authority:none',
      'do-not-expand-founder-goals-or-permissions',
      'do-not-close-physical-provider-commercial-or-elapsed-reality-from-source',
      'do-not-improve-unrelated-features',
      'preserve no-amputation law and all stronger current behavior'
    ],
    forbiddenActions: [
      'merge', 'deploy', 'send', 'spend', 'purchase', 'change-credentials', 'change-dns',
      'mutate-production', 'customer-contact', 'payment-action', 'weaken-tests', 'weaken-authority',
      'edit-sovereignty-paths', 'edit-build-protected-paths', 'invent-founder-goals',
      'self-attest-completion', 'fabricate-runtime-proof', 'fabricate-physical-proof'
    ],
    requiredOutputs: [
      'outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable', 'externalEffectLedger',
      'decision', 'codeChangeSet', 'sandwichGapAddressed', 'newlyDiscoveredStructure',
      'targetInvalidationEvidence', 'externalBlockerEvidence'
    ],
    acceptanceTests: ['npm run check:syntax', 'npm run test:deterministic'],
    budget: { maxTokens: 120_000, maxCostCents: 0 },
    economicObjective: 'maximize verified downstream capability unlocked per unit of compute, effort and founder attention while preserving truth and sovereignty',
    consequenceClass: 'LOCAL_PREPARATION',
    date
  });

  if (!compiled?.ok) return fail(compiled?.reasonCodes || ['canonical-agent-task-compilation-failed']);
  return {
    ok: true,
    status: 'SANDWICH_AGENT_TASK_READY',
    version: SANDWICH_AGENT_TASK_VERSION,
    task: compiled.task || compiled,
    sourceCommit: base,
    sandwichDigest: sandwich.sandwichDigest,
    targetDigest: sandwich.upperSlice.targetDigest,
    gapId: mission.gapId,
    executionBoundary: 'TASK_IS_COMPATIBLE_WITH_THE_EXISTING_ISOLATED_WORKER_PATH_BUT_CREATES_NO_DISPATCH_VERIFICATION_PROMOTION_MERGE_SIGNING_DEPLOYMENT_OR_EXTERNAL_AUTHORITY',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
