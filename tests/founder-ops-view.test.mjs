import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { JsonStore } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { config } from '../src/config.mjs';
import { buildFounderOpsView } from '../src/founder-ops-view.mjs';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-founder-ops-'));
  const store = new JsonStore(dir);
  await store.init();
  const cfg = {
    ...config,
    dataDir: dir,
    outbound: { ...config.outbound, enabled: false, dryRun: true },
    revenue: { ...config.revenue }
  };
  const revenueEngine = new RevenueEngine(store, cfg, null);
  return { dir, store, cfg, revenueEngine };
}

test('founder ops exposes canonical first-cash truth without creating customer or acceptance truth', async t => {
  const h = await harness();
  t.after(() => fs.rm(h.dir, { recursive: true, force: true }));

  const view = await buildFounderOpsView({
    ...h,
    env: {
      ADMIN_TOKEN: 'never-return-this-admin-token',
      DATABASE_URL: 'postgres://never-return-this-database-url',
      PAYPAL_ENVIRONMENT: 'LIVE',
      PAYPAL_LIVE_CLIENT_ID: 'never-return-this-client-id',
      PAYPAL_LIVE_CLIENT_SECRET: 'never-return-this-client-secret',
      PAYPAL_LIVE_WEBHOOK_ID: 'never-return-this-webhook-id',
      OUTBOUND_ENABLED: 'false',
      OUTBOUND_DRY_RUN: 'true'
    },
    now: new Date('2026-09-08T18:30:00.000Z')
  });

  assert.equal(view.ok, true);
  assert.equal(view.businessEffectAuthority, 'NONE');
  assert.equal(view.firstCash.canonicalPath.priceUsd, 450);
  assert.equal(view.firstCash.canonicalPath.requiresProviderOriginPaymentTruth, true);
  assert.equal(view.launchability.localConfigurationGatesClear, false);
  assert.equal(view.launchability.launchNowProven, false);
  assert.ok(view.launchability.externalActivationBlockers.includes('outbound-disabled-or-not-configured'));
  assert.ok(view.launchability.externalActivationBlockers.includes('outbound-dry-run'));
  assert.equal(view.privacy.rawPersonalCivilizationReachable, false);
  assert.equal(view.privacy.privateVaultDataIncluded, false);
  assert.equal(view.privacy.networkLifeStateAccessAuthorized, false);

  const serialized = JSON.stringify(view);
  for (const secret of [
    'never-return-this-admin-token', 'postgres://never-return-this-database-url',
    'never-return-this-client-id', 'never-return-this-client-secret', 'never-return-this-webhook-id'
  ]) assert.equal(serialized.includes(secret), false, `secret leaked: ${secret}`);
});

test('configuration presence never manufactures launch proof, cleared payment, customer, delivery or acceptance truth', async t => {
  const h = await harness();
  t.after(() => fs.rm(h.dir, { recursive: true, force: true }));
  const cfg = { ...h.cfg, outbound: { ...h.cfg.outbound, enabled: true, dryRun: false } };

  const view = await buildFounderOpsView({
    ...h,
    cfg,
    env: {
      ADMIN_TOKEN: 'x', DATABASE_URL: 'postgres://configured',
      PAYPAL_ENVIRONMENT: 'LIVE', PAYPAL_LIVE_CLIENT_ID: 'id', PAYPAL_LIVE_CLIENT_SECRET: 'secret', PAYPAL_LIVE_WEBHOOK_ID: 'hook',
      OUTBOUND_ENABLED: 'true', OUTBOUND_DRY_RUN: 'false'
    },
    now: new Date('2026-09-08T18:31:00.000Z')
  });

  assert.equal(view.launchability.localConfigurationGatesClear, true);
  assert.equal(view.launchability.launchNowProven, false);
  assert.match(view.launchability.launchNowWhyNotProven, /external evidence/i);
  assert.equal(view.launchability.externalReality.clearedPaymentCount, 0);
  assert.match(view.launchability.note, /NOT launch proof/);
  assert.match(view.truthBoundary, /CONFIGURATION PRESENCE IS NOT PROVIDER CALLABILITY OR LAUNCH PROOF/);
  assert.match(view.truthBoundary, /PREPARATION IS NOT CUSTOMER TRUTH/);
  assert.match(view.truthBoundary, /DELIVERY_READY IS NOT CUSTOMER_ACCEPTED/);
});

test('malformed or absent live store fails closed', async () => {
  const view = await buildFounderOpsView({ store: null });
  assert.equal(view.ok, false);
  assert.equal(view.status, 'FOUNDER_OPS_UNAVAILABLE');
  assert.ok(view.reasonCodes.includes('live-store-required'));
  assert.equal(view.businessEffectAuthority, 'NONE');
});
