// UberLM model foundry control plane.
// This records reproducible model lineage and gates training/deployment.
// A plan or checkpoint is never silently promoted into a trained production model.
import crypto from 'node:crypto';

export const MODEL_FOUNDRY_CONTROL_PLANE_VERSION = 'uberbond.model-foundry-control-plane.v1';
export const STAGES = Object.freeze(['FROM_SCRATCH', 'CONTINUED_PRETRAIN', 'SFT', 'PREFERENCE_OPTIMIZATION', 'DISTILLATION']);
export const STATES = Object.freeze(['PLANNED', 'DATASET_READY', 'TRAINING', 'CHECKPOINTED', 'EVAL_PASSED', 'DEPLOYABLE', 'REJECTED']);

const text = (v, max = 2000) => {
  const s = String(v ?? '').trim();
  return s && s.length <= max ? s : null;
};
const list = v => Array.isArray(v) ? v : [];
const envelope = extra => ({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', ...extra });
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function datasetAsset(input = {}) {
  const id = text(input.id);
  const source = text(input.source, 2000);
  const license = text(input.license, 200);
  const allowedPurpose = text(input.allowedPurpose, 300);
  if (!id || !source || !license || !allowedPurpose) {
    return envelope({ ok: false, status: 'DATASET_ASSET_REJECTED', reasonCodes: ['id-source-license-purpose-required'] });
  }
  if (input.containsSecrets === true || input.consentViolation === true) {
    return envelope({ ok: false, status: 'DATASET_ASSET_REJECTED', reasonCodes: ['secret-or-consent-violation'] });
  }
  return envelope({
    ok: true,
    status: 'DATASET_ASSET_READY',
    asset: {
      id, source, license, allowedPurpose,
      piiPolicy: text(input.piiPolicy, 300) || 'REMOVE_OR_EXPLICITLY_AUTHORIZE',
      contentHash: text(input.contentHash, 128),
      evidenceRefs: [...new Set(list(input.evidenceRefs).map(v => text(v, 2000)).filter(Boolean))].sort()
    }
  });
}

export function trainingRecipe(input = {}) {
  const id = text(input.id);
  const stage = STAGES.includes(input.stage) ? input.stage : null;
  const datasets = list(input.datasets).map(datasetAsset);
  const rejected = datasets.filter(x => !x.ok);
  if (!id || !stage) return envelope({ ok: false, status: 'RECIPE_REJECTED', reasonCodes: ['id-and-stage-required'] });
  if (rejected.length) return envelope({ ok: false, status: 'RECIPE_REJECTED', reasonCodes: ['dataset-policy-failure'] });
  const budgetUsd = Math.max(0, Number(input.budgetUsd) || 0);
  const maxGpuHours = Math.max(0, Number(input.maxGpuHours) || 0);
  const architecture = {
    family: text(input.architecture?.family, 120),
    parameterCount: Math.max(0, Number(input.architecture?.parameterCount) || 0),
    tokenizer: text(input.architecture?.tokenizer, 300),
    contextLength: Math.max(0, Number(input.architecture?.contextLength) || 0)
  };
  const recipe = {
    id, stage, datasets: datasets.map(x => x.asset), architecture,
    backend: text(input.backend, 120) || 'PROVIDER_NEUTRAL',
    seed: Number.isInteger(input.seed) ? input.seed : 42,
    budgetUsd, maxGpuHours,
    evalSuite: [...new Set(list(input.evalSuite).map(v => text(v)).filter(Boolean))].sort()
  };
  return envelope({ ok: true, status: 'RECIPE_READY', recipe: { ...recipe, recipeHash: hash(recipe) } });
}

export function checkpointRecord({ recipe = {}, checkpoint = {} } = {}) {
  const built = trainingRecipe(recipe);
  if (!built.ok) return built;
  const checkpointHash = text(checkpoint.hash, 128);
  const step = Math.max(0, Number(checkpoint.step) || 0);
  if (!checkpointHash) return envelope({ ok: false, status: 'CHECKPOINT_REJECTED', reasonCodes: ['checkpoint-hash-required'] });
  return envelope({
    ok: true,
    status: 'CHECKPOINT_RECORDED',
    checkpoint: {
      recipeId: built.recipe.id,
      recipeHash: built.recipe.recipeHash,
      checkpointHash,
      step,
      parentCheckpointHash: text(checkpoint.parentCheckpointHash, 128),
      metrics: checkpoint.metrics && typeof checkpoint.metrics === 'object' ? checkpoint.metrics : {}
    }
  });
}

export function evaluatePromotion({ recipe = {}, checkpoint = {}, evaluations = [], thresholds = {} } = {}) {
  const recorded = checkpointRecord({ recipe, checkpoint });
  if (!recorded.ok) return recorded;
  const required = trainingRecipe(recipe).recipe.evalSuite;
  const byId = new Map(list(evaluations).map(e => [text(e.id), e]));
  const missing = required.filter(id => !byId.has(id));
  const failed = [];
  for (const id of required) {
    const row = byId.get(id);
    const score = Number(row?.score);
    const threshold = Number(thresholds[id] ?? row?.threshold ?? 0);
    if (!Number.isFinite(score) || score < threshold) failed.push(id);
  }
  const regressions = list(evaluations).filter(e => e.regression === true).map(e => text(e.id)).filter(Boolean);
  const passed = !missing.length && !failed.length && !regressions.length;
  return envelope({
    ok: passed,
    status: passed ? 'EVAL_PASSED' : 'EVAL_BLOCKED',
    promotionState: passed ? 'EVAL_PASSED' : 'CHECKPOINTED',
    missingEvaluations: missing,
    failedEvaluations: failed,
    regressions
  });
}

export function deploymentCandidate({ recipe = {}, checkpoint = {}, evaluations = [], thresholds = {}, target = {} } = {}) {
  const gate = evaluatePromotion({ recipe, checkpoint, evaluations, thresholds });
  if (!gate.ok) return envelope({ ...gate, status: 'DEPLOYMENT_REFUSED', deploymentAuthority: 'NONE' });
  const targetId = text(target.id);
  if (!targetId) return envelope({ ok: false, status: 'DEPLOYMENT_REFUSED', reasonCodes: ['target-id-required'], deploymentAuthority: 'NONE' });
  return envelope({
    ok: true,
    status: 'DEPLOYABLE_CANDIDATE',
    deploymentAuthority: 'NONE',
    candidate: {
      targetId,
      checkpointHash: text(checkpoint.hash, 128),
      quantization: text(target.quantization, 80),
      servingAdapter: text(target.servingAdapter, 120) || 'PROVIDER_NEUTRAL',
      rollbackCheckpointHash: text(target.rollbackCheckpointHash, 128)
    },
    note: 'This object proves eligibility, not that deployment or training occurred.'
  });
}
