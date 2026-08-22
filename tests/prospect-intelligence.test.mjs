import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVIDENCE_STRENGTH,
  evidenceStrength,
  isSendableEvidenceClass,
  cappedConfidence,
  CONFIDENCE_CEILING
} from '../src/prospect-evidence.mjs';
import {
  compileProspectAdapter,
  compileCompanyCandidate,
  compilePersonCandidate,
  compileEnrichmentObservation,
  reconcileEnrichmentField,
  planEnrichmentWaterfall,
  buildProspectEvidenceBundle,
  PERSON_FIELDS
} from '../src/prospect-intelligence.mjs';

const T0 = '2026-08-01T00:00:00.000Z';
const T1 = '2026-08-10T00:00:00.000Z';
const NOW = new Date('2026-08-15T00:00:00.000Z');

function obs(overrides = {}) {
  return compileEnrichmentObservation({
    subjectId: 'person_1',
    field: 'role',
    value: 'Head of Operations',
    provider: 'provider-a',
    sourceType: 'LICENSED_ENRICHMENT',
    evidenceClass: 'LICENSED_PROVIDER',
    observedAt: T0,
    confidence: 1,
    ...overrides
  });
}

test('the evidence ladder is ordered by who is in a position to know', () => {
  assert.equal(EVIDENCE_STRENGTH[0], 'INFERRED_PATTERN');
  assert.equal(EVIDENCE_STRENGTH.at(-1), 'VERIFIED_TRANSACTION');
  assert.ok(evidenceStrength('FIRST_PARTY_PUBLIC') > evidenceStrength('LICENSED_PROVIDER'));
  assert.ok(evidenceStrength('LICENSED_PROVIDER') > evidenceStrength('THIRD_PARTY_UNVERIFIED'));
  assert.equal(evidenceStrength('MADE_UP'), -1);
});

test('a constructed address is never a sendable evidence class', () => {
  assert.equal(isSendableEvidenceClass('INFERRED_PATTERN'), false);
  assert.equal(isSendableEvidenceClass('FIRST_PARTY_PUBLIC'), true);
  assert.equal(isSendableEvidenceClass('NOT_A_CLASS'), false);
});

test('confidence is capped by evidence class, so nothing weak reports certainty', () => {
  assert.equal(cappedConfidence('INFERRED_PATTERN', 1), CONFIDENCE_CEILING.INFERRED_PATTERN);
  assert.equal(cappedConfidence('LICENSED_PROVIDER', 0.99), CONFIDENCE_CEILING.LICENSED_PROVIDER);
  assert.equal(cappedConfidence('VERIFIED_TRANSACTION', 1), 1);
  assert.equal(cappedConfidence('MADE_UP', 1), 0);
  assert.equal(cappedConfidence('LICENSED_PROVIDER', -5), 0);
});

// ---------------------------------------------------------------------------

test('a person candidate carries no contact route, however hard a caller pushes one', () => {
  const person = compilePersonCandidate({
    name: 'Alex Doe', companyId: 'company_1', role: 'COO',
    sourceType: 'COMPANY_WEBSITE', evidenceClass: 'FIRST_PARTY_PUBLIC', discoveredAt: T0,
    contactRoutes: [{ route: 'alex@example.com' }],
    email: 'alex@example.com'
  });
  assert.equal(person.ok, true);
  assert.deepEqual(person.contactRoutes, []);
  assert.equal(person.email, undefined);
});

test('a candidate without provenance is refused rather than stored weakly', () => {
  assert.deepEqual(
    compilePersonCandidate({ name: 'Alex', companyId: 'c1', sourceType: 'NOPE', evidenceClass: 'LICENSED_PROVIDER', discoveredAt: T0 }).reasonCodes,
    ['known-source-type-required']
  );
  assert.ok(compilePersonCandidate({ name: 'Alex', companyId: 'c1', sourceType: 'COMPANY_WEBSITE', evidenceClass: 'LICENSED_PROVIDER' }).reasonCodes.includes('discovered-at-required'));
  assert.ok(compilePersonCandidate({ companyId: 'c1', sourceType: 'COMPANY_WEBSITE', evidenceClass: 'LICENSED_PROVIDER', discoveredAt: T0 }).reasonCodes.includes('person-name-required'));
});

test('an adapter with unmeasured cost records unknown, never zero', () => {
  const adapter = compileProspectAdapter({
    adapterId: 'a1', kind: 'PERSON_ENRICHMENT', provider: 'anyvendor',
    evidenceClass: 'LICENSED_PROVIDER', sourceType: 'LICENSED_ENRICHMENT'
  });
  assert.equal(adapter.costPerCallCents, null);
  assert.notEqual(adapter.costPerCallCents, 0);
  assert.equal(adapter.businessEffectAuthority, 'NONE');
});

test('no vendor is named anywhere in the pipeline modules', async () => {
  const { readFileSync } = await import('node:fs');
  for (const file of ['src/prospect-intelligence.mjs', 'src/prospect-qualification.mjs', 'src/contact-verification.mjs', 'src/prospect-evidence.mjs']) {
    const source = readFileSync(file, 'utf8');
    for (const vendor of ['apify', 'openrouter', 'linkedin', 'googlesheets', 'clearbit', 'apollo', 'hunter.io']) {
      assert.ok(!new RegExp(vendor.replace('.', '\\.'), 'i').test(source.replace(/\/\/.*$/gm, '')), `${file} must not hardwire ${vendor}`);
    }
  }
});

// --- reconciliation ---------------------------------------------------------

test('stronger provenance wins outright over a more recent weaker claim', () => {
  const resolved = reconcileEnrichmentField({
    observations: [
      obs({ value: 'Head of Operations', evidenceClass: 'FIRST_PARTY_PUBLIC', sourceType: 'COMPANY_WEBSITE', observedAt: T0, provider: 'their-site' }),
      obs({ value: 'Janitor', evidenceClass: 'THIRD_PARTY_UNVERIFIED', sourceType: 'PUBLIC_PROFILE_DIRECTORY', observedAt: T1, provider: 'aggregator' })
    ],
    now: NOW
  });
  assert.equal(resolved.value, 'Head of Operations');
  assert.equal(resolved.evidenceClass, 'FIRST_PARTY_PUBLIC');
  assert.equal(resolved.conflict, false);
});

test('newest wins only among equal provenance', () => {
  const resolved = reconcileEnrichmentField({
    observations: [
      obs({ value: 'Old Title', observedAt: T0, provider: 'p1' }),
      obs({ value: 'New Title', observedAt: T1, provider: 'p1' })
    ],
    now: NOW
  });
  assert.equal(resolved.value, 'New Title');
});

test('equal-strength disagreement stays an explicit conflict with halved confidence', () => {
  const resolved = reconcileEnrichmentField({
    observations: [
      obs({ value: 'COO', provider: 'p1', confidence: 1 }),
      obs({ value: 'CFO', provider: 'p2', confidence: 1, observedAt: T1 })
    ],
    now: NOW
  });
  assert.equal(resolved.conflict, true);
  assert.deepEqual([...resolved.conflictingValues].sort(), ['CFO', 'COO']);
  assert.equal(resolved.confidence, Number((CONFIDENCE_CEILING.LICENSED_PROVIDER * 0.5).toFixed(4)));
  assert.ok(resolved.reasonCodes.includes('provider-disagreement-lowers-confidence'));
});

test('a superseded weaker claim is kept, not deleted', () => {
  const resolved = reconcileEnrichmentField({
    observations: [
      obs({ value: 'Head of Operations', evidenceClass: 'FIRST_PARTY_PUBLIC', sourceType: 'COMPANY_WEBSITE', provider: 'their-site' }),
      obs({ value: 'Janitor', evidenceClass: 'THIRD_PARTY_UNVERIFIED', sourceType: 'PUBLIC_PROFILE_DIRECTORY', provider: 'aggregator' })
    ],
    now: NOW
  });
  assert.equal(resolved.contributing.length, 2);
  assert.equal(resolved.supersededObservations.length, 1);
  assert.ok(resolved.contributing.some(item => item.value === 'Janitor'));
});

test('nothing on record means unknown, and unknown is a real answer', () => {
  const empty = reconcileEnrichmentField({ observations: [], now: NOW });
  assert.equal(empty.known, false);
  assert.equal(empty.value, null);
  assert.equal(empty.confidence, 0);
  assert.deepEqual(empty.reasonCodes, ['no-observation-on-record']);
});

test('an expired observation stops being evidence', () => {
  const resolved = reconcileEnrichmentField({
    observations: [obs({ expiresAt: '2026-08-05T00:00:00.000Z' })],
    now: NOW
  });
  assert.equal(resolved.known, false);
  assert.equal(resolved.expiredCount, 1);
  assert.deepEqual(resolved.reasonCodes, ['all-observations-expired']);
});

test('reconciliation is deterministic under input reordering', () => {
  const a = obs({ value: 'A', provider: 'p1' });
  const b = obs({ value: 'B', provider: 'p2', observedAt: T1 });
  const c = obs({ value: 'C', evidenceClass: 'PUBLIC_STRUCTURED', sourceType: 'PUBLIC_REGISTRY', provider: 'p3' });
  const orders = [[a, b, c], [c, b, a], [b, c, a], [c, a, b]];
  const results = orders.map(order => reconcileEnrichmentField({ observations: order, now: NOW }));
  for (const result of results) assert.equal(result.value, results[0].value);
  assert.equal(results[0].value, 'C');
});

// --- waterfall --------------------------------------------------------------

test('the waterfall does not pay for what a stronger source already answered', () => {
  const paid = compileProspectAdapter({
    adapterId: 'paid', kind: 'PERSON_ENRICHMENT', provider: 'vendor',
    evidenceClass: 'LICENSED_PROVIDER', sourceType: 'LICENSED_ENRICHMENT', costPerCallCents: 40, fields: ['role']
  });
  const plan = planEnrichmentWaterfall({
    subjectId: 'person_1',
    requiredFields: ['role'],
    existingObservations: [obs({ evidenceClass: 'FIRST_PARTY_PUBLIC', sourceType: 'COMPANY_WEBSITE', provider: 'their-site' })],
    adapters: [paid],
    now: NOW
  });
  assert.equal(plan.steps.length, 0);
  assert.equal(plan.satisfied[0].reason, 'already-known-at-sufficient-strength');
  assert.equal(plan.estimatedCostCents, 0);
});

test('a conflicting existing value does not satisfy the waterfall', () => {
  const paid = compileProspectAdapter({
    adapterId: 'paid', kind: 'PERSON_ENRICHMENT', provider: 'vendor',
    evidenceClass: 'PUBLIC_STRUCTURED', sourceType: 'PUBLIC_REGISTRY', costPerCallCents: 40, fields: ['role']
  });
  const plan = planEnrichmentWaterfall({
    subjectId: 'person_1',
    requiredFields: ['role'],
    existingObservations: [
      obs({ value: 'COO', evidenceClass: 'FIRST_PARTY_PUBLIC', sourceType: 'COMPANY_WEBSITE', provider: 'p1' }),
      obs({ value: 'CFO', evidenceClass: 'FIRST_PARTY_PUBLIC', sourceType: 'COMPANY_WEBSITE', provider: 'p2' })
    ],
    adapters: [paid],
    now: NOW
  });
  assert.equal(plan.steps.length, 1);
});

test('an adapter with unknown cost does not sort ahead of a measured cheap one', () => {
  const measured = compileProspectAdapter({ adapterId: 'measured', kind: 'PERSON_ENRICHMENT', provider: 'v1', evidenceClass: 'LICENSED_PROVIDER', sourceType: 'LICENSED_ENRICHMENT', costPerCallCents: 5, fields: ['role'] });
  const unmeasured = compileProspectAdapter({ adapterId: 'unmeasured', kind: 'PERSON_ENRICHMENT', provider: 'v2', evidenceClass: 'LICENSED_PROVIDER', sourceType: 'LICENSED_ENRICHMENT', fields: ['role'] });
  const plan = planEnrichmentWaterfall({
    subjectId: 'person_1', requiredFields: ['role'], existingObservations: [],
    adapters: [unmeasured, measured], now: NOW
  });
  assert.equal(plan.steps[0].adapterId, 'measured');
  assert.equal(plan.costKnown, false);
  assert.equal(plan.estimatedCostCents, null);
});

test('planning calls nobody and spends nothing', () => {
  const plan = planEnrichmentWaterfall({
    subjectId: 'person_1', requiredFields: ['role'], existingObservations: [],
    adapters: [compileProspectAdapter({ adapterId: 'a', kind: 'PERSON_ENRICHMENT', provider: 'v', evidenceClass: 'LICENSED_PROVIDER', sourceType: 'LICENSED_ENRICHMENT', costPerCallCents: 1 })],
    now: NOW
  });
  assert.equal(plan.executed, false);
  assert.equal(plan.businessEffectAuthority, 'NONE');
  for (const value of Object.values(plan.externalEffectLedger)) assert.equal(value, 0);
});

test('a verifier adapter is not accepted as an enrichment source', () => {
  const verifier = compileProspectAdapter({ adapterId: 'v', kind: 'CONTACT_VERIFIER', provider: 'v', evidenceClass: 'LICENSED_PROVIDER', sourceType: 'LICENSED_ENRICHMENT', fields: ['role'] });
  const plan = planEnrichmentWaterfall({ subjectId: 'person_1', requiredFields: ['role'], adapters: [verifier], now: NOW });
  assert.equal(plan.steps[0].action, 'NO_ADAPTER_AVAILABLE');
});

// --- bundle -----------------------------------------------------------------

function person() {
  return compilePersonCandidate({
    personId: 'person_1', name: 'Alex Doe', companyId: 'company_1', role: 'COO',
    sourceType: 'COMPANY_WEBSITE', evidenceClass: 'FIRST_PARTY_PUBLIC', discoveredAt: T0, confidence: 0.9
  });
}

test('a bundle reports unknown fields rather than filling them in', () => {
  const bundle = buildProspectEvidenceBundle({ person: person(), observations: [obs()], now: NOW });
  assert.equal(bundle.ok, true);
  assert.equal(bundle.fields.role.known, true);
  assert.ok(bundle.unknownFields.includes('department'));
  assert.ok(!bundle.unknownFields.includes('role'));
});

test('bundle confidence is the weakest link, not an average', () => {
  const bundle = buildProspectEvidenceBundle({
    person: person(),
    observations: [
      obs({ field: 'role', evidenceClass: 'FIRST_PARTY_PUBLIC', sourceType: 'COMPANY_WEBSITE', confidence: 0.9 }),
      obs({ field: 'department', evidenceClass: 'INFERRED_PATTERN', sourceType: 'SEARCH_ENGINE', value: 'Ops', confidence: 1 })
    ],
    now: NOW
  });
  assert.equal(bundle.weakestConfidence, CONFIDENCE_CEILING.INFERRED_PATTERN);
});

test('a route inherits nothing from the person who owns it', () => {
  const bundle = buildProspectEvidenceBundle({
    person: person(),
    contactRoutes: [
      { route: 'guessed@example.com', evidenceClass: 'INFERRED_PATTERN', discoveredVia: 'pattern' },
      { route: 'listed@example.com', evidenceClass: 'FIRST_PARTY_PUBLIC', discoveredVia: 'team-page' }
    ],
    now: NOW
  });
  assert.equal(bundle.contactRoutes.find(r => r.route === 'guessed@example.com').sendableEvidenceClass, false);
  assert.equal(bundle.contactRoutes.find(r => r.route === 'listed@example.com').sendableEvidenceClass, true);
});

test('an observation for a different subject cannot leak into a bundle', () => {
  const bundle = buildProspectEvidenceBundle({
    person: person(),
    observations: [obs({ subjectId: 'person_2', value: 'Someone Else Title' })],
    now: NOW
  });
  assert.equal(bundle.fields.role, undefined);
  assert.ok(bundle.unknownFields.includes('role'));
});

test('a field nobody defined is dropped rather than stored', () => {
  const rejected = compileEnrichmentObservation({
    subjectId: 'person_1', field: 'homeAddress', value: '12 Privacy Lane',
    provider: 'p', sourceType: 'LICENSED_ENRICHMENT', evidenceClass: 'LICENSED_PROVIDER', observedAt: T0
  });
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.reasonCodes, ['known-enrichment-field-required']);
  assert.ok(!PERSON_FIELDS.includes('homeAddress'));
});

// A source cannot know more than its kind allows. Without this, `sourceType`
// and `evidenceClass` are two independent strings a caller sets, so a search
// snippet could be filed as FIRST_PARTY_DECLARED and inherit both its
// confidence ceiling and its right to outrank the company's own page.
test('a source cannot claim evidence stronger than its kind can produce', () => {
  const laundered = compileEnrichmentObservation({
    subjectId: 'person_1', field: 'role', value: 'CEO', provider: 'p',
    sourceType: 'SEARCH_ENGINE', evidenceClass: 'FIRST_PARTY_DECLARED',
    observedAt: T0, confidence: 1
  });
  assert.equal(laundered.evidenceClass, 'THIRD_PARTY_UNVERIFIED');
  assert.equal(laundered.requestedEvidenceClass, 'FIRST_PARTY_DECLARED');
  assert.equal(laundered.confidence, CONFIDENCE_CEILING.THIRD_PARTY_UNVERIFIED);
});

test('the ceiling is a cap, not an assignment: a weaker claim stays weaker', () => {
  const modest = compileEnrichmentObservation({
    subjectId: 'person_1', field: 'role', value: 'CEO', provider: 'p',
    sourceType: 'COMPANY_WEBSITE', evidenceClass: 'THIRD_PARTY_UNVERIFIED',
    observedAt: T0, confidence: 1
  });
  assert.equal(modest.evidenceClass, 'THIRD_PARTY_UNVERIFIED');
});

test('the ceiling applies to candidates as well as observations', () => {
  const person = compilePersonCandidate({
    name: 'Alex Doe', companyId: 'company_1', sourceType: 'PUBLIC_PROFILE_DIRECTORY',
    evidenceClass: 'VERIFIED_TRANSACTION', discoveredAt: T0, confidence: 1
  });
  assert.equal(person.evidenceClass, 'THIRD_PARTY_UNVERIFIED');
  const company = compileCompanyCandidate({
    name: 'Acme', domain: 'acme.test', sourceType: 'SEARCH_ENGINE',
    evidenceClass: 'FIRST_PARTY_PUBLIC', discoveredAt: T0, confidence: 1
  });
  assert.equal(company.evidenceClass, 'THIRD_PARTY_UNVERIFIED');
});

test('a laundered claim cannot outrank the company page it was trying to beat', () => {
  const resolved = reconcileEnrichmentField({
    observations: [
      obs({ value: 'Head of Operations', evidenceClass: 'FIRST_PARTY_PUBLIC', sourceType: 'COMPANY_WEBSITE', provider: 'their-site' }),
      obs({ value: 'Janitor', evidenceClass: 'VERIFIED_TRANSACTION', sourceType: 'SEARCH_ENGINE', provider: 'liar', observedAt: T1 })
    ],
    now: NOW
  });
  assert.equal(resolved.value, 'Head of Operations');
  assert.equal(resolved.conflict, false);
});

test('a company candidate normalizes its domain and refuses a bare junk one', () => {
  const good = compileCompanyCandidate({ name: 'Acme', domain: 'https://WWW.Acme.co.uk/about', sourceType: 'COMPANY_WEBSITE', evidenceClass: 'FIRST_PARTY_PUBLIC', discoveredAt: T0 });
  assert.equal(good.domain, 'acme.co.uk');
  const junk = compileCompanyCandidate({ name: 'Acme', domain: 'not a domain', sourceType: 'COMPANY_WEBSITE', evidenceClass: 'FIRST_PARTY_PUBLIC', discoveredAt: T0 });
  assert.equal(junk.domain, null);
});
