// Revenue OS V2 dry run (CLAUDE_CODE_EXECUTE.md step 7). Imports three authorized, clearly
// synthetic (.invalid-domain) fixture opportunities through the same
// src/commercial-intelligence-import.mjs path a real ChatGPT Work batch would use: stores source
// evidence, scores each opportunity, records a policy decision with reason codes (pass or
// reject), and creates an owner gate ONLY for the one fixture whose pursuit actually needs a
// binding action (a marketplace submission) -- the other two never get a gate, proving gates are
// not created reflexively for every passed opportunity. Sends nothing: there is no email/HTTP-
// outbound import anywhere in this file or in commercial-intelligence-import.mjs/revenue-os.mjs.
//
// Exported as `runRevenueOsDryRun` so tests/dry-run-revenue-os.test.mjs can exercise it directly
// (fast, in-process, no subprocess) -- this is the "CI coverage for the dry-run" step 8 asks for.
// The block at the bottom only runs when this file is executed directly as a CLI script.
import fs from 'node:fs/promises';
import path from 'node:path';
import { JsonStore } from '../src/store.mjs';
import { validateCommercialIntelligenceRecord, importCommercialIntelligenceBatch } from '../src/commercial-intelligence-import.mjs';
import { buildOwnerGate } from '../src/revenue-os.mjs';

/** Three synthetic fixtures on .invalid domains (RFC 2606 reserved -- never a real organization).
 * `bindingActionNeeded` is this script's own field, not part of 04_COMMERCIAL_INTELLIGENCE_SCHEMA.json
 * -- it is read by this script after import to decide whether to create a gate, and is otherwise
 * ignored by validateCommercialIntelligenceRecord (harmless extra property). */
export function buildFixtureRecords(capturedAt) {
  const fresh = capturedAt.toISOString();
  const expires = new Date(capturedAt.getTime() + 60 * 24 * 3600000).toISOString();
  return [
    {
      id: 'fixture-opp-1', record_type: 'opportunity', organization: 'Northgate Fixture Co',
      organization_domain: 'northgate-fixture.invalid', geography: 'US', service_lane: 'website-qa',
      buyer_signal: 'Synthetic fixture: small pre-launch QA request, below the owner-gate value floor.',
      source: { url: 'https://northgate-fixture.invalid/careers', type: 'official-company', captured_at: fresh, official: true, confidence: 0.9 },
      contact: { email: 'partners@northgate-fixture.invalid', source_url: 'https://northgate-fixture.invalid/contact', published_officially: true },
      expected_value_cents: 15000, currency: 'USD', owner_minutes: 10, delivery_hours: 3,
      expires_at: expires, risks: ['Synthetic fixture -- not a real opportunity'],
      kill_condition: 'Fixture -- never pursued for real.',
      idempotency_inputs: { organization_domain: 'northgate-fixture.invalid', service_lane: 'website-qa', source_url: 'https://northgate-fixture.invalid/careers', signal_key: 'fixture-1' },
      bindingActionNeeded: null // below the $250 owner-gate value floor -- no binding action needed yet
    },
    {
      id: 'fixture-opp-2', record_type: 'opportunity', organization: 'Southridge Fixture Agency',
      organization_domain: 'southridge-fixture.invalid', geography: 'GB', service_lane: 'white-label-qa',
      buyer_signal: 'Synthetic fixture: white-label QA route via an authenticated partner portal.',
      source: { url: 'https://southridge-fixture.invalid/partners', type: 'official-partner', captured_at: fresh, official: true, confidence: 0.95 },
      contact: { email: 'partners@southridge-fixture.invalid', source_url: 'https://southridge-fixture.invalid/partners', published_officially: true },
      expected_value_cents: 75000, currency: 'USD', owner_minutes: 12, delivery_hours: 5,
      expires_at: expires, risks: ['Synthetic fixture -- not a real opportunity'],
      kill_condition: 'Fixture -- never pursued for real.',
      idempotency_inputs: { organization_domain: 'southridge-fixture.invalid', service_lane: 'white-label-qa', source_url: 'https://southridge-fixture.invalid/partners', signal_key: 'fixture-2' },
      bindingActionNeeded: { gateType: 'marketplace-submission', action: 'Submit the authenticated proposal on the (fixture) partner portal.', evidenceRequired: ['Final proposal screenshot'] }
    },
    {
      id: 'fixture-opp-3', record_type: 'opportunity', organization: 'Eastfield Fixture Studio',
      organization_domain: 'eastfield-fixture.invalid', geography: 'CA', service_lane: 'mobile-ux',
      buyer_signal: 'Synthetic fixture: deliberately fails policy on contact-domain-mismatch, to prove rejection reason codes surface.',
      source: { url: 'https://eastfield-fixture.invalid/rfp', type: 'official-company', captured_at: fresh, official: true, confidence: 0.85 },
      // Deliberately a different domain than organization_domain -- this fixture exists to prove
      // evaluateOpportunityPolicy's contact-domain-mismatch reason code actually fires and is
      // recorded, not to represent a real route.
      contact: { email: 'someone@not-eastfield-fixture.invalid', source_url: 'https://not-eastfield-fixture.invalid/contact', published_officially: true },
      expected_value_cents: 30000, currency: 'USD', owner_minutes: 15, delivery_hours: 4,
      expires_at: expires, risks: ['Synthetic fixture -- not a real opportunity'],
      kill_condition: 'Fixture -- never pursued for real.',
      idempotency_inputs: { organization_domain: 'eastfield-fixture.invalid', service_lane: 'mobile-ux', source_url: 'https://eastfield-fixture.invalid/rfp', signal_key: 'fixture-3' },
      bindingActionNeeded: null
    }
  ];
}

/**
 * Runs the dry run against `store`. Never sends anything -- no code path here has a send
 * capability. Returns a summary report: import counts, per-fixture policy decisions with reason
 * codes, and which fixture(s) actually received an owner gate (and why).
 */
export async function runRevenueOsDryRun(store, { at = new Date(), cfg = { revenueOs: { minExpectedValueCents: 10000, maxOwnerMinutes: 20, maxEvidenceAgeDays: 30 } } } = {}) {
  const fixtures = buildFixtureRecords(at);
  const records = fixtures.map(f => validateCommercialIntelligenceRecord(f));
  const importResult = await importCommercialIntelligenceBatch(store, records, { at, cfg });

  const ownerGatesCreated = [];
  for (const imported of importResult.imported) {
    const fixture = fixtures.find(f => f.id === imported.id);
    if (imported.policyDecision?.decision === 'pass' && fixture?.bindingActionNeeded) {
      const gate = buildOwnerGate({
        opportunityId: imported.id, gateType: fixture.bindingActionNeeded.gateType,
        expectedValueCents: imported.expectedValueCents, currency: imported.currency,
        ownerMinutes: imported.ownerMinutes, expiresAt: imported.expiresAt,
        action: fixture.bindingActionNeeded.action, evidenceRequired: fixture.bindingActionNeeded.evidenceRequired,
        risk: 'Synthetic fixture', killCondition: fixture.kill_condition
      });
      const saved = await store.add('ownerGates', gate);
      ownerGatesCreated.push(saved);
    }
  }

  return {
    zeroLiveSend: true,
    fixtureCount: fixtures.length,
    imported: importResult.imported.map(o => ({ id: o.id, organization: o.data?.organization, scoreTotal: o.scoreTotal, policyDecision: o.policyDecision?.decision, reasonCodes: o.policyDecision?.reasonCodes })),
    rejectedStale: importResult.rejectedStale,
    rejectedInvalid: importResult.rejectedInvalid,
    ownerGatesCreated: ownerGatesCreated.map(g => ({ id: g.id, gateType: g.gateType, opportunityId: g.opportunityId, expectedValueCents: g.expectedValueCents, ownerMinutes: g.ownerMinutes })),
    ranAt: at.toISOString()
  };
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  function option(name, fallback = '') {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
  }
  const dataDir = option('data-dir', './data/revenue-os-v2-dry-run');
  const reportFile = option('report', './data/revenue-os-v2-dry-run-report.json');
  const store = new JsonStore(dataDir);
  await store.init();
  try {
    const report = await runRevenueOsDryRun(store);
    await fs.mkdir(path.dirname(path.resolve(reportFile)), { recursive: true });
    await fs.writeFile(path.resolve(reportFile), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await store.close();
  }
}
