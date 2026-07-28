// Revenue OS V2 preview + commit demonstration. Imports four authorized, clearly synthetic
// (.invalid-domain) fixture records -- three opportunities and one owner-gate record linked to
// one of them -- through the same src/commercial-intelligence-import.mjs path a real ChatGPT Work
// batch would use, in BOTH modes: first mode:'preview' (proves preview writes zero durable
// business records, per PR #6 audit item 3), then mode:'commit' against the same store (proves the
// commit path actually persists the same outcome preview predicted, plus an owner gate created
// only for the one fixture whose pursuit needs a binding action -- the other two never get a
// gate). Sends nothing: there is no email/HTTP-outbound import anywhere in this file or in
// commercial-intelligence-import.mjs/revenue-os.mjs.
//
// Exported as `runRevenueOsDryRun` so tests/dry-run-revenue-os.test.mjs can exercise it directly.
// The block at the bottom only runs when this file is executed directly as a CLI script.
import fs from 'node:fs/promises';
import path from 'node:path';
import { JsonStore } from '../src/store.mjs';
import { validateCommercialIntelligenceRecord, importCommercialIntelligenceBatch } from '../src/commercial-intelligence-import.mjs';

/** Three synthetic opportunity fixtures plus one owner_gate fixture, all on .invalid domains (RFC
 * 2606 reserved -- never a real organization). Array order matters: the owner_gate fixture
 * references fixture-opp-2's id and must come after it so the importer's same-batch opportunity
 * linkage check (processOwnerGate's previewKnownOpportunityIds / commit-mode sequential writes)
 * can see it. */
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
      idempotency_inputs: { organization_domain: 'northgate-fixture.invalid', service_lane: 'website-qa', source_url: 'https://northgate-fixture.invalid/careers', signal_key: 'fixture-1' }
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
      idempotency_inputs: { organization_domain: 'southridge-fixture.invalid', service_lane: 'white-label-qa', source_url: 'https://southridge-fixture.invalid/partners', signal_key: 'fixture-2' }
    },
    {
      id: 'fixture-gate-1', record_type: 'owner_gate', organization: 'Southridge Fixture Agency',
      organization_domain: 'southridge-fixture.invalid', geography: 'GB', service_lane: 'white-label-qa',
      buyer_signal: 'Synthetic fixture: owner gate for the fixture-opp-2 marketplace submission.',
      source: { url: 'https://southridge-fixture.invalid/partners', type: 'official-partner', captured_at: fresh, official: true, confidence: 0.95 },
      expected_value_cents: 75000, currency: 'USD', owner_minutes: 12, delivery_hours: 5,
      expires_at: expires, risks: ['Synthetic fixture -- not a real opportunity'],
      kill_condition: 'Fixture -- never pursued for real.',
      idempotency_inputs: { organization_domain: 'southridge-fixture.invalid', service_lane: 'white-label-qa', source_url: 'https://southridge-fixture.invalid/partners', signal_key: 'fixture-2' },
      gate_type: 'marketplace-submission', opportunity_id: 'fixture-opp-2',
      action: 'Submit the authenticated proposal on the (fixture) partner portal.',
      evidence_required: ['Final proposal screenshot']
    },
    {
      id: 'fixture-opp-3', record_type: 'opportunity', organization: 'Eastfield Fixture Studio',
      organization_domain: 'eastfield-fixture.invalid', geography: 'CA', service_lane: 'mobile-ux',
      buyer_signal: 'Synthetic fixture: deliberately fails policy on contact-domain-mismatch, to prove rejection reason codes surface.',
      source: { url: 'https://eastfield-fixture.invalid/rfp', type: 'official-company', captured_at: fresh, official: true, confidence: 0.85 },
      // Deliberately a different domain than organization_domain -- this fixture exists to prove
      // evaluateOpportunityPolicy's contact-domain-mismatch reason code actually fires and is
      // recorded (canonical code 'contact-domain-mismatch', per src/policy-reason-codes.mjs).
      contact: { email: 'someone@not-eastfield-fixture.invalid', source_url: 'https://not-eastfield-fixture.invalid/contact', published_officially: true },
      expected_value_cents: 30000, currency: 'USD', owner_minutes: 15, delivery_hours: 4,
      expires_at: expires, risks: ['Synthetic fixture -- not a real opportunity'],
      kill_condition: 'Fixture -- never pursued for real.',
      idempotency_inputs: { organization_domain: 'eastfield-fixture.invalid', service_lane: 'mobile-ux', source_url: 'https://eastfield-fixture.invalid/rfp', signal_key: 'fixture-3' }
    }
  ];
}

const DEFAULT_CFG = { revenueOs: { minExpectedValueCents: 10000, maxOwnerMinutes: 20, maxEvidenceAgeDays: 30 } };

/**
 * Runs the fixture batch against `store` in both modes: preview first (zero durable business
 * writes -- returns a full computed report anyway), then commit (persists the same outcome).
 * Never sends anything -- no code path here has a send capability.
 */
export async function runRevenueOsDryRun(store, { at = new Date(), cfg = DEFAULT_CFG } = {}) {
  const fixtures = buildFixtureRecords(at);
  const records = fixtures.map(f => validateCommercialIntelligenceRecord(f));

  const preview = await importCommercialIntelligenceBatch(store, records, { mode: 'preview', cfg, at });
  const commitResult = await importCommercialIntelligenceBatch(store, records, { mode: 'commit', cfg, at });

  const summarize = report => ({
    mode: report.mode, durableWrites: report.durableWrites,
    accepted: report.accepted.map(o => ({ id: o.id, organization: o.organization ?? o.data?.organization, scoreTotal: o.scoreTotal, stage: o.stage ?? o.data?.stage })),
    policyRejected: report.policyRejected.map(o => ({ id: o.id, reasonCodes: o.reasonCodes ?? o.policyDecision?.reasonCodes })),
    ownerGatesCreated: report.ownerGatesCreated.map(g => ({ id: g.id, gateType: g.gateType, opportunityId: g.opportunityId, expectedValueCents: g.expectedValueCents, ownerMinutes: g.ownerMinutes })),
    rejectedInvalid: report.rejectedInvalid, rejectedStale: report.rejectedStale, rejectedDuplicate: report.rejectedDuplicate
  });

  return {
    zeroLiveSend: true, fixtureCount: fixtures.length,
    preview: summarize(preview), commit: summarize(commitResult),
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
