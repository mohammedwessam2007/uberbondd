import test from 'node:test';
import assert from 'node:assert/strict';
import { issueInvitation, redeemInvitation, revokeInvitation, normalizeInvitationCode, attributeBridgeLeads } from '../src/consent-bridge.mjs';
import { consentRelationshipFor } from '../src/consent-receipt.mjs';

const SECRET = 'k'.repeat(48);
const T0 = new Date('2026-09-26T09:00:00Z');
const later = days => new Date(T0.getTime() + days * 86400000);
const prospect = { company: 'Harbor Dental Group', website: 'https://harbordental.example' };
const issue = (overrides = {}) => issueInvitation({ prospect, campaignId: 'camp_postal_canary', channel: 'POSTAL_LETTER', secret: SECRET, now: T0, ...overrides });

test('an invitation carries no personal data and prints as a typeable code', () => {
  const inv = issue();
  assert.equal(inv.ok, true);
  assert.match(inv.code, /^[0-9A-HJKMNP-TV-Z]{12}$/);
  assert.match(inv.printableCode, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  assert.equal(inv.landingPath, `/?code=${inv.printableCode}`);
  const serialized = JSON.stringify(inv.record);
  assert.equal(serialized.includes('Harbor'), false);
  assert.equal(serialized.includes('harbordental'), false);
  assert.equal(serialized.includes(inv.code), false, 'only the code digest is stored');
  assert.equal(inv.record.expiresAt, later(60).toISOString());
});

test('issuing refuses email as a channel, weak secrets, missing websites and long validity', () => {
  assert.ok(issue({ channel: 'COLD_EMAIL' }).reasonCodes.includes('non-email-bridge-channel-required'));
  assert.ok(issue({ secret: 'short' }).reasonCodes.includes('invitation-secret-of-32-chars-required'));
  assert.ok(issue({ prospect: { company: 'X', website: 'not a site' } }).reasonCodes.includes('prospect-company-and-public-website-required'));
  assert.ok(issue({ validDays: 365 }).reasonCodes.includes('validity-1-to-120-days-required'));
});

test("the prospect's own request creates the consent receipts and the attribution", () => {
  const inv = issue();
  const typed = inv.printableCode.toLowerCase().replace(/0/g, 'o');
  assert.equal(normalizeInvitationCode(typed), inv.code, 'lowercase, dashes and O/0 confusion are tolerated');
  const r = redeemInvitation({ record: inv.record, code: typed, subjectEmail: 'Office@HarborDental.example', followUpConsent: true, secret: SECRET, ipAddress: '198.51.100.20', now: later(3) });
  assert.equal(r.ok, true);
  assert.equal(r.record.state, 'REDEEMED');
  assert.deepEqual(r.attribution, { invitationId: inv.record.invitationId, campaignId: 'camp_postal_canary', channel: 'POSTAL_LETTER', prospectRef: inv.record.prospectRef, redeemedAt: later(3).toISOString() });
  assert.deepEqual(r.receipts.map(x => x.wordingId), ['public-intake-v1', 'report-follow-up-v1']);
  assert.ok(r.receipts.every(x => x.channel === 'CONSENT_BRIDGE:POSTAL_LETTER' && x.sourceRef === inv.record.invitationId));

  const report = consentRelationshipFor({ receipts: r.receipts, recipientEmail: 'office@harbordental.example', purpose: 'REPORT_DELIVERY', now: later(3) });
  const followUp = consentRelationshipFor({ receipts: r.receipts, recipientEmail: 'office@harbordental.example', purpose: 'SERVICE_FOLLOW_UP', now: later(3) });
  assert.equal(report.relationship, 'USER_INITIATED');
  assert.equal(followUp.relationship, 'USER_INITIATED');
  assert.ok(consentRelationshipFor({ receipts: r.receipts, recipientEmail: 'office@harbordental.example', purpose: 'MARKETING_EMAIL', now: later(3) }).reasonCodes.includes('consent-does-not-cover-marketing_email'), 'marketing needs its own double opt-in');

  const again = redeemInvitation({ record: r.record, code: inv.code, subjectEmail: 'office@harbordental.example', secret: SECRET, now: later(4) });
  assert.equal(again.alreadyRedeemed, true);
  assert.deepEqual(again.receipts, r.receipts);
  assert.equal(again.record.redemptions.length, 1);
});

test('without the follow-up box only report delivery is permitted', () => {
  const inv = issue();
  const r = redeemInvitation({ record: inv.record, code: inv.code, subjectEmail: 'office@harbordental.example', secret: SECRET, now: later(1) });
  assert.deepEqual(r.receipts.map(x => x.wordingId), ['public-intake-v1']);
  assert.ok(consentRelationshipFor({ receipts: r.receipts, recipientEmail: 'office@harbordental.example', purpose: 'SERVICE_FOLLOW_UP', now: later(1) }).reasonCodes.includes('consent-does-not-cover-service_follow_up'));
});

test('forged, cross-invitation, wrong-secret, expired and revoked codes never create consent', () => {
  const inv = issue();
  const other = issue({ campaignId: 'camp_other' });
  const base = { record: inv.record, subjectEmail: 'office@harbordental.example', secret: SECRET, now: later(1) };
  assert.deepEqual(redeemInvitation({ ...base, code: 'ABCD-EFGH-JKMN' }).reasonCodes, ['invitation-code-invalid']);
  assert.deepEqual(redeemInvitation({ ...base, code: other.code }).reasonCodes, ['invitation-code-invalid']);
  assert.deepEqual(redeemInvitation({ ...base, code: inv.code, secret: 'z'.repeat(48) }).reasonCodes, ['invitation-code-invalid']);
  assert.deepEqual(redeemInvitation({ ...base, code: inv.code, now: later(61) }).reasonCodes, ['invitation-expired']);
  const revoked = revokeInvitation({ record: inv.record, now: later(1) }).record;
  assert.deepEqual(redeemInvitation({ ...base, record: revoked, code: inv.code }).reasonCodes, ['invitation-revoked']);
  assert.deepEqual(redeemInvitation({ ...base, code: inv.code, subjectEmail: 'not-an-email' }).reasonCodes, ['valid-subject-email-required']);
});

test('one printed code cannot be farmed into unlimited contacts', () => {
  const inv = issue();
  let record = inv.record;
  for (let i = 0; i < 5; i++) record = redeemInvitation({ record, code: inv.code, subjectEmail: `person${i}@harbordental.example`, secret: SECRET, now: later(1) }).record;
  assert.deepEqual(redeemInvitation({ record, code: inv.code, subjectEmail: 'person9@harbordental.example', secret: SECRET, now: later(1) }).reasonCodes, ['invitation-redemption-limit-reached']);
});

test('public-intake leads carrying a printed code are attributed to their invitation, with validity at request time', () => {
  const inv = issue();
  const revokedInv = issue({ campaignId: 'camp_revoked' });
  const revoked = revokeInvitation({ record: revokedInv.record, now: later(2) }).record;
  const leads = [
    { id: 'lead_ok', source: `bridge:${inv.code}`, createdAt: later(5).toISOString(), consentReceipt: { receiptId: 'ubconsent_x' } },
    { id: 'lead_late', source: `bridge:${inv.code}`, createdAt: later(90).toISOString() },
    { id: 'lead_revoked', source: `bridge:${revokedInv.code}`, createdAt: later(3).toISOString() },
    { id: 'lead_forged', source: 'bridge:ABCDEFGHJKMN', createdAt: later(3).toISOString() },
    { id: 'lead_plain', source: 'public-audit', createdAt: later(3).toISOString() }
  ];
  const a = attributeBridgeLeads({ leads, invitations: [inv.record, revoked] });
  assert.deepEqual(a.rows.map(r => [r.leadId, r.validity]), [
    ['lead_ok', 'VALID_AT_REQUEST'], ['lead_late', 'CODE_EXPIRED_BEFORE_REQUEST'], ['lead_revoked', 'CODE_REVOKED_BEFORE_REQUEST'], ['lead_forged', 'UNKNOWN_CODE']
  ]);
  assert.equal(a.attributed, 1);
  assert.deepEqual(a.byChannel, { POSTAL_LETTER: 1 });
  assert.equal(a.rows[0].hasConsentReceipt, true);
});
