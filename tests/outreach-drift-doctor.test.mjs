import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { compileOutreachDriftReport } from '../src/outreach-drift-doctor.mjs';

// Every behavioural test runs on a small synthetic tree injected through read()
// and exists(), so the suite is hermetic (it also runs in the mutation war's
// sandbox, which does not copy docs/, winnr/ or public/). One test additionally
// asserts the real repository tree where it is present.
const POINTERS = ['docs/handoffs/OUTREACH_COMMERCIAL_CURRENT.md', 'docs/g.md', 'docs/o.md', 'winnr/README.md', 'winnr/CURRENT_STATE.json', 'winnr/LIVE.md', 'winnr/PERSONAL.md', 'winnr/FINAL.md'];
const SRC = ['src/uberfleet.mjs', 'src/ubersmtp-submission-adapter.mjs', 'src/uberreply-taxonomy.mjs', 'src/outreach-cold-route-policy.mjs', 'src/prospect-preflight.mjs'];
const goodFiles = () => ({
  '00_OUTREACH_NOW.md': '# hot pointer\nWinnr pilot is current.\n',
  '00_OUTREACH_NOW.json': JSON.stringify({ primaryPointer: 'docs/handoffs/OUTREACH_COMMERCIAL_CURRENT.md', genomePath: 'docs/g.md', offerPath: 'docs/o.md', winnrRecoveryRoot: 'winnr/README.md', winnrCurrentObservations: 'winnr/CURRENT_STATE.json', winnrReconciliationReceipt: 'winnr/LIVE.md' }),
  'docs/CURRENT_HANDOFF.json': JSON.stringify({ winnrActivationReconciliation20261002: { recoveryRoot: 'winnr/README.md', currentObservations: 'winnr/CURRENT_STATE.json', evidenceReceipt: 'winnr/LIVE.md', personalSeedEvidenceRef: 'winnr/PERSONAL.md', smtpConfirmed: 3, imapConfirmed: 3, smtpQuarantinedOrdinals: [3], technicalActivation: 'COMPLETE', campaignActivation: 'NOT_ACTIVATED' } }),
  'winnr/CURRENT_STATE.json': JSON.stringify({ technicalActivation: 'COMPLETE', campaignActivation: 'NOT_ACTIVATED', provider: { name: 'winnr' }, runtime: { smtpConfirmed: 3, imapConfirmed: 3, smtpQuarantinedOrdinals: [3], evidenceRef: 'winnr/FINAL.md' }, placement: { inboxOrdinals: [1, 2], personalSeedExperiment: { quarantineReleased: false, evidenceRef: 'winnr/PERSONAL.md' } }, canonicalEvidenceRef: 'winnr/LIVE.md' }),
  'docs/handoffs/OUTREACH_COMMERCIAL_CURRENT.md': '# commercial current\nOffer quartet.\n',
  'winnr/CURRENT_STATE.md': '# winnr state\n', 'winnr/README.md': '# winnr\n', 'winnr/NEXT_STEPS.md': '# next\n',
  'src/ai.mjs': "import { classifyUberReply } from './uberreply-taxonomy.mjs';\n",
  'public/outreach-one-button.js': "const status = '/api/outreach/100k/status'; const start = '/api/outreach/100k/start'; const cs = '/api/outbound/canary/status'; const cst = '/api/outbound/canary/start'; const c = '/api/admin/uber-socket/outreach-100k-council'; const k = '/api/admin/uber-socket/cognitive-cycle'; setStatus('STARTED');",
  'server.mjs': "'/api/outreach/100k/status' '/api/outreach/100k/start' '/api/admin/uber-socket/outreach-100k-council' '/api/admin/uber-socket/cognitive-cycle'",
  'server-core.mjs': "'/api/outbound/canary/status' '/api/outbound/canary/start'"
});
function report({ files = {}, removed = [], extraExisting = [] } = {}) {
  const tree = { ...goodFiles(), ...files };
  const present = new Set([...Object.keys(tree), ...POINTERS, ...SRC, ...extraExisting]);
  for (const gone of removed) present.delete(gone);
  return compileOutreachDriftReport({
    read: file => (file in tree && present.has(file) ? tree[file] : null),
    exists: file => present.has(file)
  });
}
const kinds = r => r.findings.map(f => f.check);
const withLine = (file, line) => ({ [file]: `${goodFiles()[file]}\n${line}\n` });

test('a consistent synthetic tree has no drift, and the doctor is read-only and deterministic', () => {
  const r = report();
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings));
  assert.equal(r.ok, true);
  assert.equal(r.readOnly, true);
  assert.equal(r.externalEffects, 0);
  assert.deepEqual(report(), report());
});

const realRoot = new URL('..', import.meta.url).pathname;
test('the real repository tree has no outreach drift', { skip: !existsSync(join(realRoot, 'winnr', 'CURRENT_STATE.json')) }, () => {
  const r = compileOutreachDriftReport({ root: realRoot });
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings, null, 1));
  assert.equal(r.ok, true);
});

test('a stale "reply taxonomy absent" claim in a CURRENT document is caught because source and the production reply path disprove it', () => {
  const r = report({ files: withLine('00_OUTREACH_NOW.md', 'Limitation: reply taxonomy is missing.') });
  assert.ok(r.findings.some(f => f.check === 'STALE_CLAIM_MASQUERADING_AS_CURRENT' && f.file === '00_OUTREACH_NOW.md' && /reply-taxonomy-absent/.test(f.detail)));
});

test('the same claim is allowed when it is marked as superseded history', () => {
  assert.deepEqual(report({ files: withLine('00_OUTREACH_NOW.md', 'Historical (superseded): reply taxonomy is missing.') }).findings, []);
});

test('each historical-claim rule fires against a current document when the contradicting fact holds', () => {
  const claims = ['There is no mail host exists for this.', 'reply taxonomy is absent', 'no provider is configured', 'there is no authenticated mailbox', 'all three senders land in spam', 'cold route is absent', 'no generic prospect preflight'];
  for (const claim of claims) assert.ok(kinds(report({ files: withLine('winnr/NEXT_STEPS.md', claim) })).includes('STALE_CLAIM_MASQUERADING_AS_CURRENT'), claim);
});

test('a claim is NOT drift when the source fact it asserts is actually true (no false positive)', () => {
  const r = report({ files: withLine('winnr/NEXT_STEPS.md', 'reply taxonomy is absent'), removed: ['src/uberreply-taxonomy.mjs'] });
  assert.ok(!r.findings.some(f => /reply-taxonomy-absent/.test(f.detail)), 'with the module genuinely removed the claim is no longer stale');
});

test('pointer integrity: a pointer naming a missing file, a missing hot pointer, or an unparseable state file is drift', () => {
  assert.ok(report({ removed: ['winnr/LIVE.md'] }).findings.some(f => f.check === 'POINTER_INTEGRITY' && /LIVE\.md/.test(f.detail)));
  assert.ok(report({ removed: ['00_OUTREACH_NOW.json'] }).findings.some(f => f.check === 'POINTER_INTEGRITY' && f.file === '00_OUTREACH_NOW.json'));
  assert.ok(report({ files: { 'winnr/CURRENT_STATE.json': 'not json' } }).findings.some(f => f.check === 'POINTER_INTEGRITY' && f.file === 'winnr/CURRENT_STATE.json'));
});

test('provider-state consistency: a handoff that disagrees with the state file about SMTP counts or the quarantined ordinal is drift', () => {
  const handoff = JSON.parse(goodFiles()['docs/CURRENT_HANDOFF.json']);
  handoff.winnrActivationReconciliation20261002.smtpConfirmed = 1;
  handoff.winnrActivationReconciliation20261002.smtpQuarantinedOrdinals = [];
  const r = report({ files: { 'docs/CURRENT_HANDOFF.json': JSON.stringify(handoff) } });
  assert.ok(r.findings.some(f => f.check === 'PROVIDER_STATE_CONSISTENCY' && /smtpConfirmed/.test(f.detail)));
  assert.ok(r.findings.some(f => f.check === 'PROVIDER_STATE_CONSISTENCY' && /smtpQuarantinedOrdinals/.test(f.detail)));
});

test('a state file that releases the quarantine on a document alone is drift', () => {
  const state = JSON.parse(goodFiles()['winnr/CURRENT_STATE.json']);
  state.placement.personalSeedExperiment.quarantineReleased = true;
  assert.ok(report({ files: { 'winnr/CURRENT_STATE.json': JSON.stringify(state) } }).findings.some(f => /quarantineReleased/.test(f.detail)));
});

test('a current document claiming the cold route is live is caught while the smtp-relay provider policy still refuses it', () => {
  const r = report({ files: withLine('docs/handoffs/OUTREACH_COMMERCIAL_CURRENT.md', 'COLD_ROUTE_ENABLED: TRUE\nThe cold route is live.') });
  assert.ok(r.findings.some(f => f.check === 'COLD_ROUTE_CLAIMED_LIVE'));
  assert.ok(!kinds(report({ files: withLine('docs/handoffs/OUTREACH_COMMERCIAL_CURRENT.md', 'COLD_ROUTE_ENABLED: FALSE until legal authority is resolved.') })).includes('COLD_ROUTE_CLAIMED_LIVE'));
});

test('the founder one-button may not call a route the server does not define, use an in-browser launch model, or report STARTED without a canonical start route', () => {
  const js = goodFiles()['public/outreach-one-button.js'];
  assert.ok(kinds(report({ files: { 'public/outreach-one-button.js': `${js}\nawait request('/api/outreach/does-not-exist');` } })).includes('ONE_BUTTON_ROUTE_MISSING'));
  assert.ok(kinds(report({ files: { 'public/outreach-one-button.js': `${js}\ncompileUberLaunchRuntimeEvidence();` } })).includes('ONE_BUTTON_WEAKER_MODEL'));
  const weaker = js.replace(/\/api\/outreach\/100k\/start/g, '/api/outreach/100k/status').replace(/\/api\/outbound\/canary\/start/g, '/api/outbound/canary/status');
  assert.ok(kinds(report({ files: { 'public/outreach-one-button.js': weaker } })).includes('ONE_BUTTON_WEAKER_MODEL'));
});
