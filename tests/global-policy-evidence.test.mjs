import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  POLICY_RULE_CATALOG, POLICY_AUTHORITY_TYPES, POLICY_FRESHNESS_DAYS, POLICY_EVIDENCE_STATES, POLICY_REFRESH_REQUIRED,
  compilePolicyEvidenceRow, evaluatePolicyEvidenceFreshness, createPolicyEvidenceRegistry, requirePolicyEvidence,
  policyRuleParameters, loadPolicyEvidenceBundle, compilePolicyEvidenceStatus, DEFAULT_POLICY_EVIDENCE_BUNDLE_PATH, getPolicyRule
} from '../src/global-policy-evidence.mjs';
import { freshPolicyRows, freshPolicyRegistry, HASH, iso, DAY } from './fixtures/outreach/global-green-lane.fixture.mjs';

const now = new Date('2026-10-03T12:00:00.000Z');
const GB = 'recipient:GB:pecr-corporate-subscriber-email';
const row = (patch = {}) => ({ ruleId: GB, authorityType: 'REGULATOR_GUIDANCE', sourceUrl: 'https://ico.org.uk/guidance/b2b', retrievedAt: iso(now, -DAY), evidenceHash: HASH, uncertainty: { level: 'LOW' }, ...patch });

test('the five authority types stay distinct and the catalog never collapses them into a legal boolean', () => {
  assert.deepEqual([...POLICY_AUTHORITY_TYPES], ['LAW', 'REGULATOR_GUIDANCE', 'PROVIDER_POLICY', 'UBERBOND_CONSERVATIVE_POLICY', 'OWNER_AUTHORITY']);
  for (const spec of POLICY_RULE_CATALOG) {
    assert.ok(spec.allowedAuthorityTypes.length > 0, spec.ruleId);
    assert.ok(spec.allowedAuthorityTypes.every(t => POLICY_AUTHORITY_TYPES.includes(t)), spec.ruleId);
    assert.equal(typeof spec.permissive, 'boolean');
  }
  assert.equal(JSON.stringify(compilePolicyEvidenceRow(row(), { now }).row).includes('"legal":'), false);
});

test('a valid row compiles with every canonical provenance field', () => {
  const r = compilePolicyEvidenceRow(row({ effectiveAt: iso(now, -30 * DAY), unsubscribeRequirement: 'one-click', postalRequirement: 'valid postal address' }), { now });
  assert.equal(r.ok, true, r.errors.join());
  for (const f of ['policyId', 'jurisdiction', 'authorityType', 'sourceAuthority', 'sourceUrl', 'retrievedAt', 'effectiveAt', 'lastVerifiedAt', 'ruleScope', 'recipientClass', 'senderClass', 'contactType', 'channel', 'consentRequirement', 'identityRequirements', 'postalRequirement', 'unsubscribeRequirement', 'specialConditions', 'exceptions', 'uncertainty', 'evidenceHash', 'supersedes', 'supersededBy', 'status']) assert.ok(f in r.row, f);
});

test('hostile rows are refused: unknown field, unknown rule, wrong authority, non-authoritative host, bad hash, future dates, missing uncertainty', () => {
  const bad = patch => compilePolicyEvidenceRow(row(patch), { now });
  assert.match(bad({ allow: true }).errors.join(), /unknown-field:allow/);
  assert.match(bad({ ruleId: 'recipient:XX:made-up' }).errors.join(), /rule-not-in-catalog/);
  assert.match(bad({ authorityType: 'UBERBOND_CONSERVATIVE_POLICY' }).errors.join(), /not-allowed-for-rule/);
  assert.match(bad({ authorityType: 'NOT_A_TYPE' }).errors.join(), /authority-type-invalid/);
  assert.match(bad({ sourceUrl: 'https://evil.example/ico-says-yes' }).errors.join(), /host-not-authoritative/);
  assert.match(bad({ sourceUrl: 'http://ico.org.uk/x' }).errors.join(), /source-url-invalid/);
  assert.match(bad({ sourceUrl: 'https://user:pw@ico.org.uk/x' }).errors.join(), /source-url-invalid/);
  assert.match(bad({ evidenceHash: 'abc' }).errors.join(), /hash-required/);
  assert.match(bad({ retrievedAt: iso(now, 3 * DAY) }).errors.join(), /retrieved-in-future/);
  assert.match(bad({ lastVerifiedAt: iso(now, 3 * DAY) }).errors.join(), /last-verified-in-future/);
  assert.match(bad({ lastVerifiedAt: iso(now, -5 * DAY) }).errors.join(), /last-verified-before-retrieved/);
  assert.match(bad({ uncertainty: undefined }).errors.join(), /uncertainty-level-required/);
  assert.match(bad({ jurisdiction: 'US' }).errors.join(), /jurisdiction-mismatch/);
  assert.match(compilePolicyEvidenceRow('x', { now }).errors.join(), /not-object/);
  assert.match(compilePolicyEvidenceRow(row({ evidenceHash: HASH }), { now, evidenceText: 'real retrieved text' }).errors.join(), /hash-mismatch/);
});

test('a supplied raw evidence text is hashed and replaces the declared hash', () => {
  const r = compilePolicyEvidenceRow(row({ evidenceHash: undefined }), { now, evidenceText: 'retrieved page body' });
  assert.equal(r.ok, true);
  assert.match(r.row.evidenceHash, /^[a-f0-9]{64}$/);
});

test('OWNER_AUTHORITY cannot attest any current rule, so an owner statement can never widen a route through the evidence bundle', () => {
  for (const spec of POLICY_RULE_CATALOG) {
    const r = compilePolicyEvidenceRow({ ruleId: spec.ruleId, authorityType: 'OWNER_AUTHORITY', sourceRef: 'owner-note', retrievedAt: iso(now, -DAY), evidenceHash: HASH, uncertainty: { level: 'LOW' }, ownerAttestationRef: 'x', expiresAt: iso(now, DAY) }, { now });
    assert.equal(r.ok, false, spec.ruleId);
    assert.match(r.errors.join(), /not-allowed-for-rule:OWNER_AUTHORITY/);
  }
});

test('freshness law: each authority type has its own interval; stale, future-dated, unverified, revoked, superseded and high-uncertainty rows are never fresh', () => {
  const at = ageDays => ({ now: new Date(new Date(row().retrievedAt).getTime() + ageDays * DAY) });
  const fresh = compilePolicyEvidenceRow(row(), { now }).row;
  assert.equal(evaluatePolicyEvidenceFreshness(fresh, { now }).fresh, true);
  assert.equal(evaluatePolicyEvidenceFreshness(fresh, at(POLICY_FRESHNESS_DAYS.REGULATOR_GUIDANCE - 1)).fresh, true);
  assert.equal(evaluatePolicyEvidenceFreshness(fresh, at(POLICY_FRESHNESS_DAYS.REGULATOR_GUIDANCE + 1)).state, POLICY_EVIDENCE_STATES.STALE);
  assert.ok(POLICY_FRESHNESS_DAYS.PROVIDER_POLICY < POLICY_FRESHNESS_DAYS.REGULATOR_GUIDANCE, 'provider terms drift fastest');
  assert.equal(evaluatePolicyEvidenceFreshness(fresh, { now: new Date(now.getTime() - 30 * DAY) }).state, POLICY_EVIDENCE_STATES.FUTURE_DATED);
  assert.equal(evaluatePolicyEvidenceFreshness({ ...fresh, evidenceHash: null }, { now }).state, POLICY_EVIDENCE_STATES.UNVERIFIED_SEED);
  assert.equal(evaluatePolicyEvidenceFreshness({ ...fresh, status: 'REVOKED' }, { now }).state, POLICY_EVIDENCE_STATES.REVOKED);
  assert.equal(evaluatePolicyEvidenceFreshness({ ...fresh, supersededBy: 'newer' }, { now }).state, POLICY_EVIDENCE_STATES.SUPERSEDED);
  assert.equal(evaluatePolicyEvidenceFreshness({ ...fresh, uncertainty: { level: 'HIGH' } }, { now }).state, POLICY_EVIDENCE_STATES.HIGH_UNCERTAINTY);
  assert.equal(evaluatePolicyEvidenceFreshness({ ...fresh, effectiveAt: iso(now, 2 * DAY) }, { now }).state, POLICY_EVIDENCE_STATES.NOT_YET_EFFECTIVE);
  assert.equal(evaluatePolicyEvidenceFreshness({ ...fresh, expiresAt: iso(now, -DAY) }, { now }).state, POLICY_EVIDENCE_STATES.EXPIRED_AUTHORITY);
  assert.equal(evaluatePolicyEvidenceFreshness(null, { now }).state, POLICY_EVIDENCE_STATES.MISSING);
});

test('a row named by another row\'s supersedes is superseded even when its own status was never updated', () => {
  const a = row({ policyId: 'old' });
  const b = row({ policyId: 'new', supersedes: 'old', retrievedAt: iso(now, -2 * 3600_000) });
  const reg = createPolicyEvidenceRegistry({ rows: [a, b], now });
  const r = reg.resolveRule(GB, now);
  assert.equal(r.evidence.policyId, 'new');
  assert.equal(reg.rows.filter(x => x.ruleId === GB).length, 2, 'lineage is preserved, not deleted');
});

test('requirePolicyEvidence names every rule that must be re-researched, with its source URL, and never silently continues', () => {
  const reg = freshPolicyRegistry(now, { omit: [GB] });
  const r = requirePolicyEvidence(reg, [GB, 'recipient:US:can-spam-b2b-email'], { now });
  assert.equal(r.ok, false);
  assert.equal(r.state, POLICY_REFRESH_REQUIRED);
  assert.deepEqual(r.refreshRequired.map(x => x.ruleId), [GB]);
  assert.match(r.refreshRequired[0].sourceUrl, /^https:\/\/ico\.org\.uk\//);
  assert.equal(r.sendAuthority, false);
  const empty = requirePolicyEvidence(createPolicyEvidenceRegistry({ rows: [], now }), [GB], { now });
  assert.equal(empty.refreshRequired[0].state, POLICY_EVIDENCE_STATES.MISSING);
  assert.equal(requirePolicyEvidence(null, [GB], { now }).ok, false);
  assert.equal(requirePolicyEvidence(createPolicyEvidenceRegistry({ rows: [], now }), ['not:a:rule'], { now }).refreshRequired[0].reason, 'rule-not-in-catalog');
});

test('evidence digest is deterministic and changes when an evidence hash changes', () => {
  const a = requirePolicyEvidence(freshPolicyRegistry(now), [GB], { now }).evidenceDigest;
  const b = requirePolicyEvidence(freshPolicyRegistry(now), [GB], { now }).evidenceDigest;
  const c = requirePolicyEvidence(freshPolicyRegistry(now, { override: { [GB]: { evidenceHash: 'a'.repeat(64) } } }), [GB], { now }).evidenceDigest;
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('provider rule parameters come only from fresh evidence', () => {
  const id = 'provider:smtp-relay:winnr:cold-b2b-lawful-use';
  assert.equal(policyRuleParameters(freshPolicyRegistry(now), id, { now }).coldB2BRule, 'ALLOWED');
  assert.equal(policyRuleParameters(freshPolicyRegistry(now, { omit: [id] }), id, { now }), null);
  assert.equal(policyRuleParameters(freshPolicyRegistry(new Date(now.getTime() - 40 * DAY)), id, { now }), null, 'provider terms older than 30 days are stale');
});

test('bundle loader fails closed to an EMPTY registry: missing, oversized, corrupt, wrong schema, rows that fail validation', () => {
  const root = mkdtempSync(join(tmpdir(), 'pev-'));
  try {
    mkdirSync(join(root, 'p'), { recursive: true });
    const write = (name, body) => { writeFileSync(join(root, 'p', name), body); return `p/${name}`; };
    assert.deepEqual(loadPolicyEvidenceBundle({ root, path: 'p/missing.json', now }).loadErrors, ['policy-evidence-bundle-missing']);
    assert.deepEqual(loadPolicyEvidenceBundle({ root, path: write('corrupt.json', '{not json'), now }).loadErrors, ['policy-evidence-bundle-unreadable']);
    assert.deepEqual(loadPolicyEvidenceBundle({ root, path: write('schema.json', JSON.stringify({ schemaVersion: 'x', rows: [] })), now }).loadErrors, ['policy-evidence-bundle-schema-invalid']);
    assert.deepEqual(loadPolicyEvidenceBundle({ root, path: write('big.json', ' '.repeat(1_100_000)), now }).loadErrors, ['policy-evidence-bundle-too-large']);
    const poisoned = loadPolicyEvidenceBundle({ root, path: write('poison.json', JSON.stringify({ schemaVersion: 'uberbond.global-policy-evidence-bundle.v1', rows: [row({ sourceUrl: 'https://evil.example/x' }), row({ allow: true })] })), now });
    assert.equal(poisoned.acceptedCount, 0);
    assert.equal(poisoned.rejected.length, 2);
    assert.equal(poisoned.resolveRule(GB, now).fresh, false, 'poisoned rows grant nothing');
    const good = loadPolicyEvidenceBundle({ root, path: write('good.json', JSON.stringify({ schemaVersion: 'uberbond.global-policy-evidence-bundle.v1', rows: [row()] })), now });
    assert.equal(good.resolveRule(GB, now).fresh, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the recorded UK/US and narrow Egypt bundle is valid, scoped and authority-free at its retrieval date', () => {
  const now = new Date('2026-10-03T23:00:00Z');
  const reg = loadPolicyEvidenceBundle({ now });
  assert.deepEqual(reg.loadErrors, []);
  const status = compilePolicyEvidenceStatus(reg, { now });
  assert.deepEqual(reg.rejected, []);
  assert.equal(status.permissiveRulesFresh, 7);
  for (const id of ['recipient:US:can-spam-b2b-email', GB, 'legal-form:GB:corporate-subscriber-classes', 'registry:GB:companies-house-terms', 'provider:smtp-relay:winnr:cold-b2b-lawful-use']) {
    assert.equal(reg.resolveRule(id, now).fresh, true, id);
  }
  assert.deepEqual(status.permissiveRulesNeedingRefresh.map(r => r.ruleId).sort(), ['recipient:AU:spam-act-conspicuous-publication', 'recipient:CA:casl-conspicuous-publication']);
  assert.equal(status.sendAuthority, false);
  assert.equal(DEFAULT_POLICY_EVIDENCE_BUNDLE_PATH, 'policy/outreach/global-policy-evidence.json');
});

test('an empty evidence registry still requires refresh for every permissive rule', () => {
  const status = compilePolicyEvidenceStatus(createPolicyEvidenceRegistry({ rows: [], now }), { now });
  assert.equal(status.permissiveRulesFresh, 0);
  assert.equal(status.permissiveRulesNeedingRefresh.length, POLICY_RULE_CATALOG.filter(r => r.permissive).length);
  assert.equal(status.sendAuthority, false);
});

test('the catalog is internally consistent and a restrictive rule needs no freshness to stay restrictive', () => {
  const ids = POLICY_RULE_CATALOG.map(r => r.ruleId);
  assert.equal(new Set(ids).size, ids.length);
  for (const spec of POLICY_RULE_CATALOG.filter(r => !r.permissive)) assert.ok(/hold|deny|consent|fail-closed|uwg/.test(spec.ruleId), `${spec.ruleId} is restrictive`);
  assert.equal(getPolicyRule('recipient:US:can-spam-b2b-email').permissive, true);
  assert.equal(freshPolicyRows(now).length, POLICY_RULE_CATALOG.length);
});
