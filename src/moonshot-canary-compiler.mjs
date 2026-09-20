import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileMoonshot, chooseMinimumRealityProbe } from './moonshot-reality-compiler.mjs';

export const MOONSHOT_CANARY_COMPILER_VERSION = 'uberbond.moonshot-canary-compiler.v1';

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const text = (value, max = 2400) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => envelope({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  ...extra
});

export function compileCanaryProgram(canary = {}) {
  const economics = canary?.probeEconomics || {};
  const requiredEvidence = Array.isArray(canary?.requiredEvidence) ? canary.requiredEvidence : null;
  const reasons = [];
  if (!text(canary?.id, 160)) reasons.push('canary-id-required');
  if (!text(canary?.literalName, 500)) reasons.push('literal-name-required');
  if (!text(canary?.firstClaim, 2400)) reasons.push('first-claim-required');
  if (!text(canary?.firstFalsifier, 2400)) reasons.push('first-falsifier-required');
  if (!text(canary?.firstProbe, 2400)) reasons.push('first-probe-required');
  if (!text(canary?.measurement, 2400)) reasons.push('measurement-required');
  if (!text(canary?.claimType, 64)) reasons.push('claim-type-required');
  if (!requiredEvidence?.length) reasons.push('required-evidence-required');
  for (const key of ['informationGain','cost','risk','irreversibility','delay']) {
    const n = Number(economics[key]);
    if (!Number.isFinite(n) || n < 0 || n > 100) reasons.push(`probe-economics-${key}-must-be-0-to-100`);
  }
  if (typeof economics.authorityReady !== 'boolean') reasons.push('probe-authority-readiness-required');
  if (reasons.length) return fail('MOONSHOT_CANARY_INVALID', reasons);

  const compiled = compileMoonshot({
    id: canary.id,
    name: canary.literalName,
    source: 'config:moonshot-reality-canaries.json',
    thesis: canary.firstClaim,
    aliases: [],
    domains: [canary.lane || 'UNKNOWN'],
    claims: [{
      claimId: 'first-claim',
      statement: canary.firstClaim,
      type: canary.claimType,
      falsifier: canary.firstFalsifier,
      feasibility: 'INSUFFICIENT_INFORMATION',
      assumptions: [],
      requiredEvidence,
      evidenceRefs: []
    }],
    constraints: [],
    dependencies: [],
    unknowns: [canary.promotionBlocker],
    resurrectionConditions: [],
    irreversibleRisks: [],
    authorityRequirements: economics.authorityReady ? [] : ['EXPLICIT_AUTHORITY_BEFORE_EXTERNAL_OR_HUMAN_EFFECTS']
  });
  if (!compiled.ok) return compiled;

  const probe = chooseMinimumRealityProbe({
    candidates: [{
      id: `probe:${canary.id}:first`,
      claimId: 'first-claim',
      measurement: canary.measurement,
      falsifier: canary.firstFalsifier,
      informationGain: economics.informationGain,
      cost: economics.cost,
      risk: economics.risk,
      irreversibility: economics.irreversibility,
      delay: economics.delay,
      authorityReady: economics.authorityReady
    }]
  });
  if (!probe.ok) return probe;

  return envelope({
    ok: true,
    status: 'MOONSHOT_CANARY_PROGRAM_COMPILED',
    id: canary.id,
    lane: canary.lane,
    moonshot: compiled.moonshot,
    selectedProbe: probe.selected,
    requiredEvidence,
    promotionBlocker: canary.promotionBlocker,
    executionAuthority: 'NONE',
    claimBoundary: 'CANARY_PROGRAM_IS_A_RESEARCH_PACKET__NOT_AN_EXECUTED_EXPERIMENT_OR_MOONSHOT_PROOF'
  });
}

export function compileCanaryWave({ canaries = [] } = {}) {
  if (!Array.isArray(canaries) || canaries.length === 0 || canaries.length > 256) {
    return fail('MOONSHOT_CANARY_WAVE_INVALID', ['one-to-256-canaries-required']);
  }
  const programs = [];
  const rejected = [];
  for (const canary of canaries) {
    const result = compileCanaryProgram(canary);
    if (result.ok) programs.push(result);
    else rejected.push({ id: canary?.id || null, reasonCodes: result.reasonCodes || ['compile-failed'] });
  }
  programs.sort((a,b) => b.selectedProbe.score - a.selectedProbe.score || a.id.localeCompare(b.id));
  return envelope({
    ok: rejected.length === 0,
    status: rejected.length ? 'MOONSHOT_CANARY_WAVE_REJECTED_PARTIALLY' : 'MOONSHOT_CANARY_WAVE_READY',
    compiledCount: programs.length,
    rejectedCount: rejected.length,
    programs,
    rejected,
    nextCandidate: programs[0] || null,
    law: 'CANARY_ORDER_USES_VALUE_OF_INFORMATION_HEURISTIC__NOT_GRANDNESS_OR_FICTIONAL_IQ'
  });
}
