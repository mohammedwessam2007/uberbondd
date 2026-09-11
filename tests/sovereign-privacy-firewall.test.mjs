import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySovereignDisclosure,
  evaluateSovereignPrivacyFirewall,
  externalArtifactSha256,
  assertSovereignPrivacyForExternalMessage
} from '../src/sovereign-privacy-firewall.mjs';

const clean = {
  from:'Mohamed <sales@example.com>',
  to:'owner@example.org',
  subject:'Quick website observation',
  body:'I noticed a conversion issue on your contact page. Want the three-point teardown?'
};

test('clean public-facing business copy passes', () => {
  const out = evaluateSovereignPrivacyFirewall({ message: clean });
  assert.equal(out.ok, true);
  assert.deepEqual(out.findings, []);
});

test('UberBond identity is private by default', () => {
  const out = evaluateSovereignPrivacyFirewall({ message: { ...clean, body:'I build UberBond.' } });
  assert.equal(out.ok, false);
  assert.ok(out.findings.includes('UBERBOND_PRIVATE_IDENTITY'));
});

test('repo url and architecture names are denied', () => {
  const msg = { ...clean, body:'Public repo: https://github.com/mohammedwessam2007/uberbondd. Temporal Foundry and MAX Council handle this.' };
  const findings = classifySovereignDisclosure(msg);
  assert.ok(findings.includes('REPOSITORY_LOCATION'));
  assert.ok(findings.includes('INTERNAL_ARCHITECTURE'));
  assert.throws(() => assertSovereignPrivacyForExternalMessage(msg), error => error.code === 'SOVEREIGN_PRIVACY_FIREWALL_DENY');
});

test('private payment destination is not general prospect collateral', () => {
  const out = evaluateSovereignPrivacyFirewall({ message: { ...clean, body:'Pay here: PayPal.me/Sarawessam' } });
  assert.equal(out.ok, false);
  assert.ok(out.findings.includes('PRIVATE_PAYMENT_DESTINATION'));
});

test('declassification is exact recipient and exact artifact bound', () => {
  const message = { ...clean, body:'I build UberBond.' };
  const receipt = {
    status:'APPROVED',
    scope:'EXTERNAL_DISCLOSURE',
    recipient:message.to,
    artifactSha256:externalArtifactSha256(message),
    allowedClasses:['UBERBOND_PRIVATE_IDENTITY']
  };
  assert.equal(evaluateSovereignPrivacyFirewall({ message, declassificationReceipt:receipt }).ok, true);
  assert.equal(evaluateSovereignPrivacyFirewall({ message:{...message,to:'other@example.org'}, declassificationReceipt:receipt }).ok, false);
  assert.equal(evaluateSovereignPrivacyFirewall({ message:{...message,body:'I build UberBond. Public repo: https://github.com/mohammedwessam2007/uberbondd'}, declassificationReceipt:receipt }).ok, false);
});
