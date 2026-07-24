// Workstream 18: fixtures and demonstration. Confirms every synthetic pack fixture is real,
// parseable, and behaves as documented -- and that the fixtures are unambiguously synthetic
// (reserved TLD), never mistakable for market proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agencyPackCsv, buyerIntentPackJson, marketplacePackJsonl, partnerPackMarkdown,
  invalidPackCsv, duplicatePackCsv, maliciousPackCsv, maliciousArchiveEntries, fakeReplies, fakePaymentEvidence
} from '../../revenue-os/fixtures/synthetic-packs.mjs';
import { importCsvPack, importJsonPack, importJsonlPack, importMarkdownTablePack, precheckZipPack } from '../../revenue-os/src/importer.mjs';
import { classifyReply } from '../../revenue-os/src/reply.mjs';

test('every synthetic pack fixture uses only the reserved .invalid TLD, never a real-looking domain', () => {
  for (const text of [agencyPackCsv(), buyerIntentPackJson(), marketplacePackJsonl(), partnerPackMarkdown()]) {
    assert.doesNotMatch(text, /\.(com|net|org|io)\b/i);
  }
});

test('agencyPackCsv, buyerIntentPackJson, marketplacePackJsonl, and partnerPackMarkdown all import at least one real record', () => {
  assert.ok(importCsvPack(agencyPackCsv(), { packType: 'qualified_agency' }).accepted.length > 0);
  assert.ok(importJsonPack(buyerIntentPackJson(), { packType: 'buyer_intent' }).accepted.length > 0);
  assert.ok(importJsonlPack(marketplacePackJsonl(), { packType: 'marketplace_demand' }).accepted.length > 0);
  assert.ok(importMarkdownTablePack(partnerPackMarkdown(), { packType: 'partner' }).accepted.length > 0);
});

test('invalidPackCsv is entirely quarantined, not partially accepted', () => {
  const { accepted, quarantined } = importCsvPack(invalidPackCsv(), { packType: 'qualified_agency' });
  assert.equal(accepted.length, 0);
  assert.equal(quarantined.length, 3);
});

test('duplicatePackCsv accepts the first occurrence and quarantines the repeat', () => {
  const { accepted, quarantined } = importCsvPack(duplicatePackCsv(), { packType: 'qualified_agency' });
  assert.equal(accepted.length, 1);
  assert.equal(quarantined.length, 1);
});

test('maliciousPackCsv (formula-injection domain) is entirely quarantined', () => {
  assert.equal(importCsvPack(maliciousPackCsv(), { packType: 'qualified_agency' }).accepted.length, 0);
});

test('maliciousArchiveEntries fails the archive-safety pre-check', () => {
  assert.equal(precheckZipPack(maliciousArchiveEntries()).safe, false);
});

test('fakeReplies classify to real, non-ambiguous categories', () => {
  const replies = fakeReplies();
  assert.ok(replies.length >= 2);
  for (const reply of replies) assert.notEqual(classifyReply(reply.body).category, 'ambiguous');
});

test('fakePaymentEvidence produces a well-shaped evidence object with the requested amount', () => {
  const evidence = fakePaymentEvidence({ amountCents: 25000 });
  assert.equal(evidence.amountCents, 25000);
  assert.equal(evidence.currency, 'USD');
  assert.ok(evidence.reference);
  assert.ok(evidence.timestamp);
});
