import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyChannelPurpose, assertAllowedBusinessPurpose, assertEvidenceFreshness, preflightChannelSafety,
  ChannelSafetyError, ALLOWED_BUSINESS_PURPOSES, EXPLICITLY_DENIED_PURPOSES
} from '../../revenue-os/src/channel-safety.mjs';

// --- allowlist: every allowed classification actually resolves ---

test('every allowed business purpose resolves via its own canonical name', () => {
  for (const purpose of ALLOWED_BUSINESS_PURPOSES) {
    const result = classifyChannelPurpose(purpose);
    assert.equal(result.ok, true, `expected ${purpose} to be allowed`);
    assert.equal(result.classification, purpose);
  }
});

test('common real-world spellings resolve to the right allowed classification', () => {
  assert.equal(classifyChannelPurpose('Business Inquiries').classification, 'business_inquiry');
  assert.equal(classifyChannelPurpose('vendor-inquiry').classification, 'vendor_inquiry');
  assert.equal(classifyChannelPurpose('Partnerships').classification, 'partnership_inquiry');
  assert.equal(classifyChannelPurpose('RFQ').classification, 'procurement_inquiry');
  assert.equal(classifyChannelPurpose('Sales Inquiry').classification, 'general_commercial');
});

// --- hostile: every named fail-closed category from the mission, reproduced and proven rejected ---

test('every explicitly named disallowed purpose is rejected, not silently downgraded', () => {
  for (const denied of EXPLICITLY_DENIED_PURPOSES) {
    const result = classifyChannelPurpose(denied);
    assert.equal(result.ok, false, `expected ${denied} to be rejected`);
    assert.ok(result.reason.startsWith('disallowed-purpose:'), `expected explicit-deny reason for ${denied}, got ${result.reason}`);
  }
});

test('hostile: support/customer-service/technical-support variants are all rejected', () => {
  for (const label of ['support', 'Support', 'customer service', 'Customer Service', 'customer-service', 'technical support', 'tech support', 'help desk']) {
    const result = classifyChannelPurpose(label);
    assert.equal(result.ok, false, `expected "${label}" to be rejected`);
  }
});

test('hostile: careers/emergency/consumer-service/booking/estimate/personal are all rejected', () => {
  for (const label of ['careers', 'Careers', 'jobs', 'emergency', 'Emergency', '24/7 emergency', 'consumer service', 'booking', 'book now', 'estimate', 'get a quote', 'personal', "Bob's personal email"]) {
    const result = classifyChannelPurpose(label);
    assert.equal(result.ok, false, `expected "${label}" to be rejected`);
  }
});

test('hostile: unknown, malformed, and arbitrary unrecognized values fail closed', () => {
  for (const label of ['', '   ', null, undefined, 'xyzzy', '12345', 'zzz_not_a_real_purpose', '☃', 'DROP TABLE purposes;']) {
    const result = classifyChannelPurpose(label);
    assert.equal(result.ok, false, `expected "${label}" to be rejected`);
    assert.ok(['malformed-purpose-label', 'unrecognized-purpose'].includes(result.reason), `unexpected reason for "${label}": ${result.reason}`);
  }
});

test('assertAllowedBusinessPurpose throws ChannelSafetyError for a denied purpose and returns the classification for an allowed one', () => {
  assert.equal(assertAllowedBusinessPurpose('vendor inquiries'), 'vendor_inquiry');
  assert.throws(() => assertAllowedBusinessPurpose('careers'), ChannelSafetyError);
  assert.throws(() => assertAllowedBusinessPurpose('anything-unrecognized'), ChannelSafetyError);
});

// --- evidence freshness ---

test('evidence freshness: a normal recent timestamp passes', () => {
  const result = assertEvidenceFreshness(new Date(Date.now() - 3600000).toISOString());
  assert.equal(result.ok, true);
});

test('evidence freshness: missing/malformed timestamps fail closed', () => {
  for (const bad of ['', null, undefined, 'not-a-date', '2026-13-45', 'yesterday']) {
    assert.equal(assertEvidenceFreshness(bad).ok, false);
  }
});

test('evidence freshness: a timestamp beyond the freshness window is stale', () => {
  const old = new Date(Date.now() - 91 * 86400000).toISOString();
  const result = assertEvidenceFreshness(old, { freshnessWindowDays: 90 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale-evidence');
});

test('evidence freshness: a future-dated timestamp beyond clock-skew allowance is rejected (regression: this previously passed silently)', () => {
  const future = new Date(Date.now() + 3600000).toISOString(); // 1 hour in the future
  const result = assertEvidenceFreshness(future, { clockSkewAllowanceMs: 5 * 60 * 1000 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'future-dated-evidence');
});

test('evidence freshness: a small future timestamp within the clock-skew allowance still passes', () => {
  const slightlyFuture = new Date(Date.now() + 60000).toISOString(); // 1 minute
  const result = assertEvidenceFreshness(slightlyFuture, { clockSkewAllowanceMs: 5 * 60 * 1000 });
  assert.equal(result.ok, true);
});

test('evidence freshness: a far-future timestamp (e.g. a bad year field) is rejected, not treated as merely stale', () => {
  const result = assertEvidenceFreshness('2099-01-01T00:00:00.000Z');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'future-dated-evidence');
});

// --- combined preflight gate ---

test('preflightChannelSafety accepts only when both purpose and evidence are valid', () => {
  const good = preflightChannelSafety({ purposeLabel: 'vendor inquiries', capturedAt: new Date().toISOString() });
  assert.equal(good.ok, true);
  assert.equal(good.classification, 'vendor_inquiry');
  assert.equal(good.evidenceHash.length, 64);
});

test('preflightChannelSafety reports every applicable reason, not just the first', () => {
  const result = preflightChannelSafety({ purposeLabel: 'careers', capturedAt: 'not-a-date' });
  assert.equal(result.ok, false);
  assert.equal(result.reasons.length, 2);
  assert.ok(result.reasons.some(r => r.startsWith('purpose:')));
  assert.ok(result.reasons.some(r => r.startsWith('evidence:')));
});

test('preflightChannelSafety rejects a future-dated support-channel candidate on both axes', () => {
  const result = preflightChannelSafety({ purposeLabel: 'emergency', capturedAt: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons.sort(), ['evidence:future-dated-evidence', 'purpose:disallowed-purpose:emergency'].sort());
});
