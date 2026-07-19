import test from 'node:test';
import assert from 'node:assert/strict';
import { runAcquisitionAcceptance } from '../scripts/acquisition-acceptance.mjs';

test('deterministic acceptance runs discovery through paid delivery without live providers', async () => {
  const result = await runAcquisitionAcceptance({ quiet: true });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'test');
  assert.deepEqual(result.transitions.map(item => item.stage), [
    'fixture-discovery',
    'normalize-and-import',
    'fixture-crawl',
    'deterministic-audit',
    'opportunity-score',
    'public-contact',
    'evidence-locked-draft',
    'owner-approval',
    'owner-schedule',
    'simulated-gmail-send',
    'followup-simulation',
    'simulated-reply',
    'followup-stop',
    'offer-created',
    'offer-approval',
    'checkout',
    'verified-webhook',
    'paid-order',
    'delivery-task'
  ]);
  assert.equal(result.summary.discovered, 1);
  assert.equal(result.summary.imported, 1);
  assert(result.summary.findings > 0);
  assert(result.summary.score >= 60);
  assert.equal(result.summary.replyClass, 'asks-for-information');
  assert.equal(result.summary.paidOrders, 1);
  assert.equal(result.summary.deliveryTasks, 1);
  assert.deepEqual(result.safety, {
    dryRun: true,
    outboundProvider: 'test',
    simulatedEmails: 1,
    realEmails: 0,
    webhookMode: 'test',
    externalNetworkCalls: 0,
    customerSitesModified: 0,
    liveSendApproved: false
  });
});
