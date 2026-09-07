import test from 'node:test';
import assert from 'node:assert/strict';
import { compileLifeKnowledgeSnapshot, compileLifePossibilityPortfolio, compileFutureSelfCouncil } from '../src/personal-civilization-kernel.mjs';

const base = () => ({
  snapshotId: 'integrity',
  goals: ['preserve truthful optionality'],
  constraints: ['founder sovereignty'],
  values: ['truth'],
  evidenceRefs: ['evidence:founder-stated-goal']
});

const effects = { agency: 0, capability: 0, understanding: 0, meaningfulExperience: 0, relationships: 0, freedom: 0, healthSupport: 0, creativity: 0, economicResilience: 0, timeSovereignty: 0, meaning: 0 };

test('duplicate capability and future-path identities fail closed', () => {
  const duplicateCapability = compileLifeKnowledgeSnapshot({
    ...base(),
    capabilityInventory: [
      { id: 'x', prerequisites: [], evidenceRefs: [] },
      { id: 'x', prerequisites: [], evidenceRefs: [] }
    ]
  });
  assert.equal(duplicateCapability.ok, false);
  assert.ok(duplicateCapability.reasonCodes.includes('duplicate-capability-id'));

  const duplicatePath = compileLifeKnowledgeSnapshot({
    ...base(),
    futurePaths: [
      { id: 'same', requiredCapabilities: [], evidenceRefs: [] },
      { id: 'same', requiredCapabilities: [], evidenceRefs: [] }
    ]
  });
  assert.equal(duplicatePath.ok, false);
  assert.ok(duplicatePath.reasonCodes.includes('duplicate-future-path-id'));
});

test('cyclic capability prerequisites are invalid rather than treated as growth plans', () => {
  const result = compileLifeKnowledgeSnapshot({
    ...base(),
    capabilityInventory: [
      { id: 'a', prerequisites: ['b'], evidenceRefs: [] },
      { id: 'b', prerequisites: ['a'], evidenceRefs: [] }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('capability-prerequisite-cycle'));
});

test('unknown prerequisite is surfaced as a capability gap rather than invented', () => {
  const result = compileLifeKnowledgeSnapshot({
    ...base(),
    capabilityInventory: [{ id: 'advanced', prerequisites: ['missing-foundation'], evidenceRefs: [] }]
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.snapshot.missingPrerequisiteCapabilities, ['missing-foundation']);
});

test('malformed future uncertainty and lead time fail closed', () => {
  const uncertainty = compileLifeKnowledgeSnapshot({ ...base(), futurePaths: [{ id: 'p', uncertainty: 2, requiredCapabilities: [], evidenceRefs: [] }] });
  assert.equal(uncertainty.ok, false);
  assert.ok(uncertainty.reasonCodes.includes('future-path-invalid'));

  const lead = compileLifeKnowledgeSnapshot({ ...base(), futurePaths: [{ id: 'p', preparationLeadTimeDays: -1, requiredCapabilities: [], evidenceRefs: [] }] });
  assert.equal(lead.ok, false);
  assert.ok(lead.reasonCodes.includes('future-path-invalid'));
});

test('snapshot must carry provenance for its claimed life objective', () => {
  const result = compileLifeKnowledgeSnapshot({ ...base(), evidenceRefs: [] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('evidence-ref-required'));
});

test('duplicate intervention identities and contradictory future effects fail closed', () => {
  const compiled = compileLifeKnowledgeSnapshot({ ...base(), futurePaths: [{ id: 'known', requiredCapabilities: [], evidenceRefs: [] }] });
  const intervention = { id: 'i', effects, evidenceRefs: [], opensFutureIds: [], preservesFutureIds: ['known'], closesFutureIds: [], capabilityIds: [] };
  const duplicate = compileLifePossibilityPortfolio({ snapshot: compiled.snapshot, interventions: [intervention, intervention] });
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.reasonCodes.includes('duplicate-intervention-id'));

  const contradiction = compileLifePossibilityPortfolio({ snapshot: compiled.snapshot, interventions: [{ ...intervention, preservesFutureIds: ['known'], closesFutureIds: ['known'] }] });
  assert.equal(contradiction.ok, false);
  assert.ok(contradiction.reasonCodes.includes('intervention-invalid'));
});

test('intervention cannot pretend to preserve or close a future absent from the snapshot', () => {
  const compiled = compileLifeKnowledgeSnapshot({ ...base(), futurePaths: [{ id: 'known', requiredCapabilities: [], evidenceRefs: [] }] });
  const result = compileLifePossibilityPortfolio({
    snapshot: compiled.snapshot,
    interventions: [{ id: 'i', effects, evidenceRefs: [], opensFutureIds: [], preservesFutureIds: ['invented'], closesFutureIds: [], capabilityIds: [] }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('intervention-reference-invalid'));
});

test('future-self perspective identities are immutable and unique', () => {
  const result = compileFutureSelfCouncil({
    decision: 'test',
    perspectives: [
      { id: 'same', horizon: '1 year', priorities: [], concerns: [], evidenceRefs: [] },
      { id: 'same', horizon: '20 years', priorities: [], concerns: [], evidenceRefs: [] }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('duplicate-perspective-id'));
});
