import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { seedScheduledMission } from './agent-mesh-mission-seed.mjs';

export const NORTH_STAR_INITIATIVE_DISPATCH_VERSION = 'uberbond.north-star-initiative-dispatch.v1';
const SHA40 = /^[a-f0-9]{40}$/i;
const SHA64 = /^[a-f0-9]{64}$/i;
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(reasonCodes, status = 'NORTH_STAR_INITIATIVE_DISPATCH_REFUSED', extra = {}) {
  return {
    ok: false,
    policyVersion: NORTH_STAR_INITIATIVE_DISPATCH_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

export function compileInitiativeOccurrence(cycle = {}) {
  const sourceCommit = text(cycle?.portfolio?.sourceCommit, 80).toLowerCase();
  const portfolioId = text(cycle?.portfolio?.portfolioId, 100).toLowerCase();
  const realityDigest = text(cycle?.portfolio?.realityDigest, 100).toLowerCase();
  const selectedCandidateId = text(cycle?.portfolio?.selectedCandidateId, 240).toLowerCase();
  const goalContractId = text(cycle?.goalContract?.id, 240).toLowerCase();
  const mission = cycle?.agentMeshMission;
  const reasons = [];
  if (cycle?.ok !== true || cycle?.status !== 'NORTH_STAR_INITIATIVE_CYCLE_READY') reasons.push('ready-initiative-cycle-required');
  if (!SHA40.test(sourceCommit)) reasons.push('exact-source-commit-required');
  if (!SHA64.test(portfolioId)) reasons.push('portfolio-id-required');
  if (!SHA64.test(realityDigest)) reasons.push('reality-digest-required');
  if (!selectedCandidateId || !goalContractId || selectedCandidateId !== goalContractId) reasons.push('selected-goal-identity-required');
  if (!mission || typeof mission !== 'object' || Array.isArray(mission)) reasons.push('agent-mesh-mission-required');
  if (!text(mission?.objective, 4000) || !Array.isArray(mission?.acceptanceTests) || mission.acceptanceTests.length === 0) reasons.push('bounded-agent-mesh-mission-required');
  if (Number(mission?.founderActionBudget ?? 0) !== 0) reasons.push('zero-founder-action-budget-required');
  if (reasons.length) return fail(reasons);

  const occurrenceIdentity = {
    sourceCommit,
    portfolioId,
    realityDigest,
    selectedCandidateId,
    missionKey: text(mission.missionKey, 240) || goalContractId
  };
  const occurrenceDigest = digest(occurrenceIdentity);
  return {
    ok: true,
    policyVersion: NORTH_STAR_INITIATIVE_DISPATCH_VERSION,
    status: 'NORTH_STAR_INITIATIVE_OCCURRENCE_READY',
    occurrenceKey: `north-star/${sourceCommit}/${occurrenceDigest}`,
    occurrenceDigest,
    sourceCommit,
    portfolioId,
    realityDigest,
    selectedCandidateId,
    mission,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export async function seedInitiativeCycle({ store, cycle, date = new Date() } = {}) {
  const occurrence = compileInitiativeOccurrence(cycle);
  if (!occurrence.ok) return occurrence;
  const seeded = await seedScheduledMission({
    store,
    mission: occurrence.mission,
    occurrenceKey: occurrence.occurrenceKey,
    date
  });
  if (!seeded?.ok) {
    return fail(
      ['agent-mesh-durable-seed-required', ...(seeded?.reasonCodes || [])],
      'NORTH_STAR_INITIATIVE_DISPATCH_BLOCKED',
      { occurrenceKey: occurrence.occurrenceKey }
    );
  }
  return {
    ok: true,
    policyVersion: NORTH_STAR_INITIATIVE_DISPATCH_VERSION,
    status: seeded.status === 'ALREADY_SEEDED'
      ? 'NORTH_STAR_INITIATIVE_ALREADY_DISPATCHED'
      : 'NORTH_STAR_INITIATIVE_DISPATCHED',
    occurrenceKey: occurrence.occurrenceKey,
    occurrenceDigest: occurrence.occurrenceDigest,
    sourceCommit: occurrence.sourceCommit,
    portfolioId: occurrence.portfolioId,
    realityDigest: occurrence.realityDigest,
    selectedCandidateId: occurrence.selectedCandidateId,
    runId: seeded.runId || null,
    missionKey: seeded.missionKey || occurrence.mission.missionKey || null,
    duplicate: seeded.status === 'ALREADY_SEEDED',
    seededStatus: seeded.status,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'This receipt proves that one bounded North-Star mission was durably seeded into the existing Agent Mesh run ledger for this exact source and reality occurrence. It does not prove a model ran, an external effect occurred, or the mission outcome succeeded.'
  };
}
