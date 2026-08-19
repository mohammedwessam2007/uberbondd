import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { importProspects, normalizeImportedContact, normalizeImportedEvidence, validateProspect } from '../src/prospect-import.mjs';

test('normalizes an exact licensed business contact without inference', () => {
  const result = normalizeImportedContact({
    email: 'Owner@Northstar.example', contact_name: 'Alex Owner', contact_title: 'Founder',
    contact_source: 'licensed_export', email_verification_status: 'valid', verificationScore: 0.92,
    contact_source_url: 'https://provider.example/record/1', contact_observed_at: '2026-08-12T12:00:00Z'
  });
  assert.deepEqual(result.warnings, []);
  assert.equal(result.contact.email, 'owner@northstar.example');
  assert.equal(result.contact.source, 'licensed_export');
  assert.equal(result.contact.verified, 'valid');
  assert.equal(result.contact.verificationScore, 92);
  assert.equal(result.contact.exact, true);
  assert.equal(result.contact.inferred, false);
});

test('omits malformed imported email and leaves an auditable warning', () => {
  const result = normalizeImportedContact({ email: 'not-an-email', contactName: 'Unknown' });
  assert.equal(result.contact, null);
  assert.deepEqual(result.warnings, ['invalid_business_email_omitted']);
});

test('normalizes imported evidence as owner-review-only', () => {
  const result = normalizeImportedEvidence({
    evidenceTitle: 'Public QA requirement',
    evidenceUrl: 'https://northstar.example/careers',
    evidenceExcerpt: 'The public page describes a need for website QA before the next release.',
    evidenceConfidence: 0.9,
    sourceLicense: 'public website'
  });
  assert.equal(result.warnings.length, 0);
  assert.equal(result.issue.evidenceUrl, 'https://northstar.example/careers');
  assert.equal(result.issue.confidence, 0.9);
  assert.equal(result.issue.imported, true);
  assert.equal(result.issue.safeForOutreach, false);
});

test('validateProspect retains contact, evidence and source provenance', () => {
  const prospect = validateProspect({
    company: 'Northstar Medical Studio', website: 'https://northstar.example', niche: 'medical agency',
    source: 'licensed_export', sourceRecordId: 'row-17', sourceLicense: 'customer export',
    sourceMetadata: { batch: '2026-08-13' }, email: 'owner@northstar.example', emailVerificationStatus: 'valid',
    contactSource: 'licensed_export', evidenceTitle: 'QA request', evidenceUrl: 'https://northstar.example/careers',
    evidenceExcerpt: 'The public careers page describes the QA requirement.'
  });
  assert.equal(prospect.contact.email, 'owner@northstar.example');
  assert.equal(prospect.issue.title, 'QA request');
  assert.equal(prospect.issue.safeForOutreach, false);
  assert.equal(prospect.sourceMetadata.batch, '2026-08-13');
  assert.equal(prospect.sourceMetadata.intakeVersion, 'uberbond.prospect-import.v2');
});

test('importProspects persists the exact contact and provenance for later lead scoring', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-prospect-intake-'));
  const store = new Store(dir);
  await store.init();
  const result = await importProspects(store, { maxBatch: 25 }, [{
    company: 'Northstar Medical Studio', website: 'https://northstar.example', niche: 'medical agency', country: 'CA',
    email: 'owner@northstar.example', emailVerificationStatus: 'valid', contactSource: 'licensed_export',
    source: 'licensed_export', sourceRecordId: 'row-1', sourceLicense: 'owner-authorized export'
  }]);
  assert.equal(result.added.length, 1);
  const stored = await store.get('prospects', result.added[0].id);
  assert.equal(stored.contact.email, 'owner@northstar.example');
  assert.equal(stored.contact.inferred, false);
  assert.equal(stored.sourceRecordId, 'row-1');
});
