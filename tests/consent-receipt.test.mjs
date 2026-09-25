import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileConsentReceipt,
  confirmConsentReceipt,
  revokeConsentReceipt,
  consentRelationshipFor,
  verifyConsentReceiptIntegrity,
  CONSENT_WORDINGS
} from '../src/consent-receipt.mjs';
import { compileRecipientEligibility } from '../src/uberoutbound-recipient-eligibility.mjs';
import { compileUberPostalIdentity } from '../src/uberpostal-identity.mjs';

const SECRET = 's'.repeat(40);
const T0 = new Date('2026-09-25T10:00:00Z');
const hours = h => new Date(T0.getTime() + h * 3600000);
const intake = (overrides = {}) => compileConsentReceipt({ subjectEmail: 'Owner@Agency.example', wordingId: 'public-intake-v1', channel: 'PUBLIC_INTAKE_FORM', sourceRef: 'lead_1', capturedAt: T0, ipAddress: '203.0.113.9', ...overrides });
const marketing = (overrides = {}) => compileConsentReceipt({ subjectEmail: 'owner@agency.example', wordingId: 'marketing-opt-in-v1', channel: 'REPORT_PAGE', sourceRef: 'lead_1', capturedAt: T0, secret: SECRET, ...overrides });

test('a receipt binds the exact wording, purpose, channel and time without keeping the raw address or IP', () => {
  const r = intake();
  assert.equal(r.ok, true);
  assert.equal(r.receipt.state, 'ACTIVE');
  assert.equal(r.receipt.relationship, 'USER_INITIATED');
  assert.deepEqual(r.receipt.purposes, ['REPORT_DELIVERY']);
  assert.equal(r.confirmationToken, null);
  const serialized = JSON.stringify(r.receipt);
  assert.equal(serialized.toLowerCase().includes('owner@agency.example'), false);
  assert.equal(serialized.includes('203.0.113.9'), false);
  assert.equal(verifyConsentReceiptIntegrity(r.receipt), true);
  assert.equal(intake().receipt.receiptId, r.receipt.receiptId, 'deterministic identity');
});

test('invalid capture facts are refused', () => {
  assert.ok(intake({ subjectEmail: 'nope' }).reasonCodes.includes('valid-subject-email-required'));
  assert.ok(intake({ wordingId: 'made-up' }).reasonCodes.includes('registered-consent-wording-required'));
  assert.ok(intake({ channel: '' }).reasonCodes.includes('capture-channel-required'));
  assert.ok(intake({ sourceRef: '' }).reasonCodes.includes('capture-source-reference-required'));
  assert.ok(intake({ capturedAt: 'soon' }).reasonCodes.includes('capture-time-required'));
  assert.ok(marketing({ secret: 'short' }).reasonCodes.includes('confirmation-secret-of-32-chars-required'));
});

test('tampering with purposes, state or wording breaks integrity and the receipt stops counting', () => {
  const r = intake().receipt;
  for (const tampered of [{ ...r, purposes: ['MARKETING_EMAIL'] }, { ...r, state: 'ACTIVE', relationship: 'EXPLICIT_OPT_IN' }, { ...r, wordingHash: 'x' }]) {
    assert.equal(verifyConsentReceiptIntegrity(tampered), false);
  }
  const forged = { ...r, purposes: ['MARKETING_EMAIL'] };
  assert.deepEqual(consentRelationshipFor({ receipts: [forged], recipientEmail: 'owner@agency.example', purpose: 'MARKETING_EMAIL', now: hours(1) }).reasonCodes, ['consent-receipt-integrity-failed']);
});

test('a receipt whose wording no longer matches the registered text is rejected even with a consistent digest', async () => {
  const crypto = await import('node:crypto');
  const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
  const { receiptDigest, ...core } = intake().receipt;
  const drifted = { ...core, wordingHash: sha('an older sentence the person never saw') };
  const resealed = { ...drifted, receiptDigest: sha(JSON.stringify(drifted)) };
  assert.equal(verifyConsentReceiptIntegrity(resealed), false);
});

test('marketing consent counts only after double opt-in confirmation with the issued token', () => {
  const m = marketing();
  assert.equal(m.receipt.state, 'PENDING_CONFIRMATION');
  assert.ok(m.confirmationToken);
  assert.equal(JSON.stringify(m.receipt).includes(m.confirmationToken), false, 'only the digest is stored');
  assert.deepEqual(consentRelationshipFor({ receipts: [m.receipt], recipientEmail: 'owner@agency.example', purpose: 'MARKETING_EMAIL', now: hours(1) }).reasonCodes, ['consent-awaiting-double-opt-in-confirmation']);

  assert.deepEqual(confirmConsentReceipt({ receipt: m.receipt, token: 'guess', secret: SECRET, now: hours(1) }).reasonCodes, ['confirmation-token-mismatch']);
  assert.deepEqual(confirmConsentReceipt({ receipt: m.receipt, token: m.confirmationToken, secret: 't'.repeat(40), now: hours(1) }).reasonCodes, ['confirmation-token-not-issued-by-this-secret']);
  assert.deepEqual(confirmConsentReceipt({ receipt: m.receipt, token: m.confirmationToken, secret: SECRET, now: hours(169) }).reasonCodes, ['confirmation-window-expired']);

  const confirmed = confirmConsentReceipt({ receipt: m.receipt, token: m.confirmationToken, secret: SECRET, now: hours(2) });
  assert.equal(confirmed.receipt.state, 'ACTIVE');
  assert.equal(confirmed.receipt.confirmedAt, hours(2).toISOString());
  const rel = consentRelationshipFor({ receipts: [confirmed.receipt], recipientEmail: 'OWNER@agency.example', purpose: 'MARKETING_EMAIL', now: hours(3) });
  assert.equal(rel.relationship, 'EXPLICIT_OPT_IN');
  assert.match(rel.relationshipEvidenceRef, /^ubconsent_[0-9a-f]{32}#[0-9a-f]{16}$/);
});

test('purpose, subject, revocation and age are enforced', () => {
  const report = intake().receipt;
  assert.deepEqual(consentRelationshipFor({ receipts: [report], recipientEmail: 'owner@agency.example', purpose: 'MARKETING_EMAIL', now: hours(1) }).reasonCodes, ['consent-does-not-cover-marketing_email']);
  assert.deepEqual(consentRelationshipFor({ receipts: [report], recipientEmail: 'someone@agency.example', purpose: 'REPORT_DELIVERY', now: hours(1) }).reasonCodes, ['no-consent-receipt-for-this-recipient']);
  assert.equal(consentRelationshipFor({ receipts: [report], recipientEmail: 'owner@agency.example', purpose: 'REPORT_DELIVERY', now: hours(1) }).relationship, 'USER_INITIATED');
  assert.deepEqual(consentRelationshipFor({ receipts: [report], recipientEmail: 'owner@agency.example', purpose: 'REPORT_DELIVERY', now: hours(24 * 800) }).reasonCodes, ['consent-stale']);

  const revoked = revokeConsentReceipt({ receipt: report, now: hours(5) }).receipt;
  assert.equal(revoked.state, 'REVOKED');
  assert.deepEqual(consentRelationshipFor({ receipts: [report, revoked], recipientEmail: 'owner@agency.example', purpose: 'REPORT_DELIVERY', now: hours(6) }).reasonCodes, ['consent-revoked-for-this-purpose']);
  const regranted = intake({ sourceRef: 'lead_2', capturedAt: hours(10) }).receipt;
  assert.equal(consentRelationshipFor({ receipts: [report, revoked, regranted], recipientEmail: 'owner@agency.example', purpose: 'REPORT_DELIVERY', now: hours(11) }).receiptId, regranted.receiptId);
});

test('a confirmed opt-in makes a German recipient eligible where cold email is rejected', () => {
  const NOW = hours(3);
  const postal = compileUberPostalIdentity({ legalName: 'Example LLC', line1: '1 Example St', city: 'Example', country: 'US', ownerAuthorized: true, publicFooterAuthorized: true, evidenceRef: 'owner:test', now: NOW });
  const base = {
    recipient: { email: 'owner@agency.example', type: 'CORPORATE', jurisdiction: 'DE' },
    source: { kind: 'INBOUND_REQUEST', ref: 'lead_1', observedAt: T0.toISOString(), collectionMethod: 'MANUAL' },
    senderJurisdiction: 'EG',
    senderCompliance: { truthfulFromAndReplyTo: true, unsubscribeMechanism: true, unsubscribeHonoredWithinBusinessDays: 1 },
    postalIdentity: postal,
    transportColdB2BRule: 'PROHIBITED',
    now: NOW
  };
  assert.equal(compileRecipientEligibility(base).decision, 'REJECT', 'cold path stays closed');

  const m = marketing();
  const confirmed = confirmConsentReceipt({ receipt: m.receipt, token: m.confirmationToken, secret: SECRET, now: hours(2) }).receipt;
  const rel = consentRelationshipFor({ receipts: [confirmed], recipientEmail: 'owner@agency.example', purpose: 'MARKETING_EMAIL', now: NOW });
  const decision = compileRecipientEligibility({ ...base, relationship: rel.relationship, relationshipEvidenceRef: rel.relationshipEvidenceRef });
  assert.equal(decision.basis, 'PERMISSIONED_EXPLICIT_OPT_IN');
  assert.equal(decision.legal.status, 'PASSED');
});

test('the registered public-intake wording is the sentence the public form shows', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes(CONSENT_WORDINGS['public-intake-v1'].text), 'public/index.html must display the exact registered wording');
});

test('the public intake stores a sealed consent receipt beside the legacy boolean', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const { Store } = await import('../src/store.mjs');
  const { RevenueEngine } = await import('../src/revenue.mjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-consent-intake-'));
  try {
    const store = new Store(dir);
    await store.init();
    const config = { baseUrl: 'https://audit.test', dataDir: dir, encryptionKey: 'a'.repeat(64), revenue: { publicIntake: true, publicRateLimitPerHour: 10 }, google: {}, sender: {} };
    const engine = new RevenueEngine(store, config, { running: true, paused: false, runBatch: async () => {} });
    const withConsent = await engine.createLead({ company: 'Acme', website: 'https://example.com', email: 'Owner@Example.com', consent: true }, '198.51.100.4');
    const lead = await store.get('leads', withConsent.leadId);
    assert.equal(lead.consent, true);
    assert.equal(verifyConsentReceiptIntegrity(lead.consentReceipt), true);
    assert.equal(lead.consentReceipt.sourceRef, lead.id);
    assert.equal(lead.consentReceipt.channel, 'PUBLIC_INTAKE_FORM');
    assert.equal(JSON.stringify(lead.consentReceipt).includes('198.51.100.4'), false);
    const rel = consentRelationshipFor({ receipts: [lead.consentReceipt], recipientEmail: 'owner@example.com', purpose: 'REPORT_DELIVERY', now: new Date(Date.parse(lead.createdAt) + 60000) });
    assert.equal(rel.relationship, 'USER_INITIATED');
    assert.ok(consentRelationshipFor({ receipts: [lead.consentReceipt], recipientEmail: 'owner@example.com', purpose: 'MARKETING_EMAIL' }).reasonCodes.includes('consent-does-not-cover-marketing_email'));

    const without = await engine.createLead({ company: 'Beta', website: 'https://beta.example', email: 'b@beta.example' }, '198.51.100.5');
    const bare = await store.get('leads', without.leadId);
    assert.equal(bare.consent, false);
    assert.equal(bare.consentReceipt, undefined);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
