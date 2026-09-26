import test from 'node:test';
import assert from 'node:assert/strict';
import { compileOutreachBuyList } from '../src/uberbuy-outreach-bom.mjs';

test('with domains and compute already owned the only possible mandatory outreach purchase is sender substrate', () => {
  const r = compileOutreachBuyList({
    domainsOwned: 30,
    controlPlaneOwned: true,
    outboundSubstrate: {
      candidate: 'maildoso',
      acquired: false,
      authorized: false,
      configured: false,
      cashRequired: true,
      outboundSmtp: false,
      inboundForwarding: false,
      warmup: false
    },
    paymentRail: { live: false },
    regulatory: { status: 'UNKNOWN' },
    publicContactSupply: { status: 'OBSERVED_ONE_DAY_COVERED' }
  });
  assert.deepEqual(r.summary.mandatoryNewPurchaseIds, ['authorized_outbound_substrate']);
  assert.equal(r.summary.mandatoryNewPurchaseCount, 1);
  assert.equal(r.summary.recurringOutreachSaasRequired, 0);
  assert.equal(r.external.find(x => x.id === 'domains').status, 'SATISFIED');
  assert.equal(r.external.find(x => x.id === 'control_plane').status, 'SATISFIED');
});

test('a free trial keeps sender substrate an acquisition rather than a fabricated purchase', () => {
  const r = compileOutreachBuyList({
    domainsOwned: 30,
    controlPlaneOwned: true,
    outboundSubstrate: {
      candidate: 'maildoso-trial',
      acquired: false,
      authorized: false,
      configured: false,
      cashRequired: false,
      outboundSmtp: false,
      inboundForwarding: false,
      warmup: false
    }
  });
  assert.deepEqual(r.summary.mandatoryNewPurchaseIds, []);
  assert.deepEqual(r.summary.externalAcquisitionIds, ['authorized_outbound_substrate']);
});

test('sender substrate stays non-green until outbound SMTP, inbound forwarding, and warmup all exist', () => {
  const r = compileOutreachBuyList({
    domainsOwned: 30,
    controlPlaneOwned: true,
    outboundSubstrate: {
      acquired: true,
      authorized: true,
      configured: true,
      cashRequired: false,
      outboundSmtp: true,
      inboundForwarding: false,
      warmup: true
    }
  });
  const row = r.external.find(x => x.id === 'authorized_outbound_substrate');
  assert.notEqual(row.status, 'SATISFIED');
  assert.deepEqual(row.missingCapabilities, ['inboundForwarding']);
});

test('a complete configured authorized substrate removes every mandatory outreach SaaS purchase', () => {
  const r = compileOutreachBuyList({
    domainsOwned: 30,
    controlPlaneOwned: true,
    outboundSubstrate: {
      acquired: true,
      authorized: true,
      configured: true,
      cashRequired: false,
      outboundSmtp: true,
      inboundForwarding: true,
      warmup: true
    },
    paymentRail: { live: true },
    regulatory: { status: 'PASSED' },
    publicContactSupply: { status: 'OBSERVED_MONTH_COVERED' }
  });
  assert.equal(r.status, 'NO_NEW_PURCHASE_REQUIRED');
  assert.equal(r.summary.mandatoryNewPurchaseCount, 0);
  assert.equal(r.internal.some(x => x.id === 'inbox_placement_dashboard'), true);
  assert.equal(r.internal.some(x => x.id === 'inbound_reply_ingestion'), true);
});

test('regulatory work, placement seed inboxes, and paid lead data are never mislabeled as mandatory outreach SaaS', () => {
  const r = compileOutreachBuyList({
    domainsOwned: 30,
    controlPlaneOwned: true,
    outboundSubstrate: {
      acquired: true,
      authorized: true,
      configured: true,
      cashRequired: false,
      outboundSmtp: true,
      inboundForwarding: true,
      warmup: true
    },
    regulatory: { status: 'UNKNOWN' }
  });
  const reg = r.external.find(x => x.id === 'regulatory_clearance');
  const placement = r.external.find(x => x.id === 'placement_seed_inboxes');
  const leadData = r.external.find(x => x.id === 'paid_lead_data');
  assert.equal(reg.classification, 'EXTERNAL_REGULATORY');
  assert.equal(reg.monthlyPurchaseRequired, false);
  assert.equal(placement.monthlyPurchaseRequired, false);
  assert.equal(leadData.classification, 'OPTIONAL_SUPPLIER');
});
