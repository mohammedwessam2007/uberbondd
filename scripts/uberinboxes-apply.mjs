import { config } from '../src/config.mjs';
import { resolveProviderAdapter } from '../src/provider-adapter-contract.mjs';
import { compileUberInboxesFleet, materializeUberInboxes, reconcileUberInboxes } from '../src/uberinboxes.mjs';

function bool(value) {
  return String(value || '').trim().toUpperCase() === 'YES';
}

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

const provider = String(process.env.UBERINBOXES_PROVIDER || 'icemail').trim();
const execute = bool(process.env.UBERINBOXES_APPLY);
const spendLimitCents = integer(process.env.UBERINBOXES_SPEND_LIMIT_CENTS, 0);
const estimatedCostCents = integer(process.env.UBERINBOXES_ESTIMATED_COST_CENTS, 0);

const resolution = resolveProviderAdapter(config, provider);
const adapter = resolution.adapter;

let existingMailboxes = [];
if (resolution.ok && typeof adapter?.listMailboxes === 'function') {
  const inventory = await adapter.listMailboxes({});
  if (inventory?.ok && Array.isArray(inventory.mailboxes)) existingMailboxes = inventory.mailboxes;
}

const compiled = compileUberInboxesFleet({ existingMailboxes });
const base = {
  provider,
  adapterReady: resolution.ok,
  adapterReason: resolution.reason,
  executeRequested: execute,
  desiredMailboxCount: compiled?.fleet?.desiredMailboxCount ?? 0,
  existingMailboxCount: compiled?.fleet?.existingMailboxCount ?? 0,
  missingMailboxCount: compiled?.fleet?.missingMailboxCount ?? 0,
  fleetDigest: compiled?.fleet?.fleetDigest ?? null
};

if (!compiled.ok) {
  console.log(JSON.stringify({ ...base, status: compiled.status, reasonCodes: compiled.reasonCodes || [] }, null, 2));
  process.exitCode = 1;
} else if (!execute) {
  console.log(JSON.stringify({
    ...base,
    status: 'UBERINBOXES_PLAN_ONLY',
    nextAction: 'Set UBERINBOXES_APPLY=YES with a configured provider and an explicit spend limit to perform provider mailbox creation.',
    externalEffects: 0
  }, null, 2));
} else if (!resolution.ok) {
  console.log(JSON.stringify({
    ...base,
    status: 'UBERINBOXES_APPLY_BLOCKED',
    reasonCodes: ['provider-not-configured']
  }, null, 2));
  process.exitCode = 2;
} else {
  const approval = {
    granted: true,
    grantedBy: 'founder-explicit-uberinboxes-apply',
    scope: `${provider}:provisionMailboxes`,
    spendLimitCents,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  };

  const materialized = await materializeUberInboxes({
    providerAdapter: adapter,
    providerName: provider,
    fleet: compiled.fleet,
    ownerApproval: approval,
    estimatedCostCents
  });

  if (!materialized.ok) {
    console.log(JSON.stringify({ ...base, materialized }, null, 2));
    process.exitCode = 3;
  } else {
    const reconciliation = await reconcileUberInboxes({ providerAdapter: adapter, fleet: compiled.fleet });
    console.log(JSON.stringify({
      ...base,
      materialized,
      reconciliation,
      sendAuthorityCreated: false
    }, null, 2));
    if (!reconciliation.ok || reconciliation.status !== 'UBERINBOXES_FULLY_OBSERVED') process.exitCode = 4;
  }
}
