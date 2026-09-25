import crypto from 'node:crypto';
import { compileUberDosoTopology, UBERDOSO_ROOTS, UBERDOSO_MAX_MAILBOXES_PER_DOMAIN } from './uberdoso-kernel.mjs';

export const UBERINBOXES_VERSION = 'uberbond.uberinboxes.v1';

// Eight aliases per owned root. They are all aliases of the same founder identity,
// not fabricated people. Provider/runtime creation is still evidence-gated.
export const DEFAULT_UBERINBOXES_LOCAL_PARTS = Object.freeze([
  'mohamed',
  'mohamed.w',
  'mohamed.wessam',
  'm.wessam',
  'wessam',
  'wessam.m',
  'mohamedw',
  'mwessam'
]);

const UNKNOWN_OUTCOME = new Set([
  'EXTERNAL_OUTCOME_UNKNOWN',
  'PROVIDER_OUTCOME_UNKNOWN',
  'TIMEOUT_AFTER_WRITE'
]);

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeExisting(existingMailboxes = []) {
  return new Set((Array.isArray(existingMailboxes) ? existingMailboxes : [])
    .map(item => text(item?.address || item?.email, 320).toLowerCase())
    .filter(Boolean));
}

// senderDomains extends the fleet from the two roots to chosen names from the
// 28-domain outreach fleet (all 30 owned domains are outreach senders). UberDoso's
// topology validates every name against the verified fleet registry.
export function compileUberInboxesFleet({
  roots = UBERDOSO_ROOTS,
  senderDomains = [],
  localParts = DEFAULT_UBERINBOXES_LOCAL_PARTS,
  existingMailboxes = []
} = {}) {
  const cleanedParts = unique((Array.isArray(localParts) ? localParts : [])
    .map(item => text(item, 64).toLowerCase())
    .filter(Boolean));
  if (!cleanedParts.length) {
    return {
      ok: false,
      version: UBERINBOXES_VERSION,
      status: 'UBERINBOXES_REFUSED',
      reasonCodes: ['at-least-one-local-part-required'],
      externalEffectAuthority: 'NONE'
    };
  }
  if (cleanedParts.length > UBERDOSO_MAX_MAILBOXES_PER_DOMAIN) {
    return {
      ok: false,
      version: UBERINBOXES_VERSION,
      status: 'UBERINBOXES_REFUSED',
      reasonCodes: [`mailboxes-per-domain-exceeds-${UBERDOSO_MAX_MAILBOXES_PER_DOMAIN}`],
      externalEffectAuthority: 'NONE'
    };
  }

  const topology = compileUberDosoTopology({ roots, senderDomains, mailboxLocalParts: cleanedParts });
  if (!topology?.ok) {
    return {
      ...topology,
      version: UBERINBOXES_VERSION,
      status: 'UBERINBOXES_REFUSED'
    };
  }

  const existing = normalizeExisting(existingMailboxes);
  const desired = topology.topology.roots.flatMap(row => row.mailboxes.map(mailbox => ({
    mailboxId: mailbox.id,
    address: mailbox.address,
    domain: row.root,
    localPart: mailbox.address.split('@')[0],
    identityClass: 'FOUNDER_ALIAS',
    desiredState: 'PROVISIONED_NOT_AUTHORIZED_TO_SEND',
    alreadyExists: existing.has(mailbox.address.toLowerCase())
  })));
  const missing = desired.filter(item => !item.alreadyExists);
  const byDomain = Object.fromEntries(topology.topology.roots.map(row => [
    row.root,
    missing.filter(item => item.domain === row.root)
  ]));

  const fleet = {
    schemaVersion: 'uberinboxes.fleet.v1',
    roots: [...roots],
    ...(topology.topology.roots.length > roots.length ? { senderDomains: topology.topology.roots.slice(roots.length).map(row => row.root) } : {}),
    localParts: cleanedParts,
    desiredMailboxCount: desired.length,
    existingMailboxCount: desired.length - missing.length,
    missingMailboxCount: missing.length,
    desired,
    missing,
    byDomain,
    sendAuthorityCreated: false,
    externalEffectAuthority: 'NONE'
  };
  fleet.fleetDigest = digest(fleet);

  return {
    ok: true,
    version: UBERINBOXES_VERSION,
    status: missing.length ? 'UBERINBOXES_FLEET_READY_TO_PROVISION' : 'UBERINBOXES_FLEET_ALREADY_MATERIALIZED',
    fleet,
    externalEffectAuthority: 'NONE'
  };
}

function splitCost(total, index, count) {
  const value = Number(total);
  if (!Number.isFinite(value) || value < 0 || count <= 0) return null;
  const base = Math.floor(value / count);
  const remainder = Math.round(value) - base * count;
  return base + (index < remainder ? 1 : 0);
}

/**
 * Materialize a compiled UberInboxes fleet through an already-configured,
 * provider-approved adapter. This function does not invent provider auth,
 * billing, DNS, mailbox success, or send authority.
 *
 * A write with an unknown external outcome stops the sequence. It is never
 * blindly retried because duplicate mailbox purchases/provisioning would be a
 * real side effect.
 */
export async function materializeUberInboxes({
  providerAdapter,
  providerName = '',
  fleet,
  ownerApproval = null,
  estimatedCostCents = null
} = {}) {
  const provider = text(providerName || providerAdapter?.providerName, 80).toLowerCase();
  if (!fleet?.fleetDigest || !Array.isArray(fleet?.missing)) {
    return {
      ok: false,
      version: UBERINBOXES_VERSION,
      status: 'UBERINBOXES_PROVISIONING_BLOCKED',
      reasonCodes: ['valid-uberinboxes-fleet-required'],
      externalEffectAuthority: 'NONE'
    };
  }
  if (!providerAdapter || typeof providerAdapter.provisionMailboxes !== 'function') {
    return {
      ok: false,
      version: UBERINBOXES_VERSION,
      status: 'UBERINBOXES_PROVISIONING_BLOCKED',
      reasonCodes: ['provider-provision-mailboxes-capability-required'],
      externalEffectAuthority: 'NONE'
    };
  }
  if (providerAdapter.configured !== true) {
    return {
      ok: false,
      version: UBERINBOXES_VERSION,
      status: 'UBERINBOXES_PROVISIONING_BLOCKED',
      reasonCodes: ['provider-auth-required'],
      provider: provider || null,
      externalEffectAuthority: 'NONE'
    };
  }
  if (!ownerApproval?.granted) {
    return {
      ok: false,
      version: UBERINBOXES_VERSION,
      status: 'UBERINBOXES_PROVISIONING_BLOCKED',
      reasonCodes: ['explicit-owner-approval-required'],
      provider: provider || null,
      externalEffectAuthority: 'NONE'
    };
  }
  if (!fleet.missing.length) {
    return {
      ok: true,
      version: UBERINBOXES_VERSION,
      status: 'UBERINBOXES_ALREADY_MATERIALIZED',
      provider: provider || null,
      requestedMailboxCount: 0,
      providerCalls: 0,
      receipts: [],
      externalEffectAuthority: 'NONE',
      sendAuthorityCreated: false
    };
  }

  const domains = unique(fleet.missing.map(item => item.domain));
  const receipts = [];
  let requestedMailboxCount = 0;
  let confirmedProviderWrites = 0;

  for (let index = 0; index < domains.length; index += 1) {
    const domain = domains[index];
    const rows = fleet.missing.filter(item => item.domain === domain);
    const mailboxPayload = rows.map(item => ({
      email: item.address,
      domain: item.domain,
      localPart: item.localPart,
      displayName: 'Mohamed Wessam'
    }));
    const idempotencyKey = `uberinboxes:${provider || 'provider'}:${fleet.fleetDigest}:${domain}`;
    const domainCost = splitCost(estimatedCostCents, index, domains.length);
    const result = await providerAdapter.provisionMailboxes({
      mailboxes: mailboxPayload,
      ownerApproval,
      idempotencyKey,
      ...(domainCost == null ? {} : { estimatedCostCents: domainCost })
    });

    requestedMailboxCount += rows.length;
    receipts.push({
      domain,
      mailboxCount: rows.length,
      addresses: rows.map(item => item.address),
      providerStatus: text(result?.status, 120) || 'UNKNOWN',
      ok: result?.ok === true,
      operationId: result?.operationId || null,
      providerRequestId: result?.providerRequestId || null,
      providerReceipt: result?.providerReceipt || result?.data || null
    });

    if (result?.ok === true) {
      confirmedProviderWrites += 1;
      continue;
    }

    const status = text(result?.status, 120).toUpperCase();
    if (UNKNOWN_OUTCOME.has(status)) {
      return {
        ok: false,
        version: UBERINBOXES_VERSION,
        status: 'UBERINBOXES_EXTERNAL_OUTCOME_UNKNOWN',
        provider: provider || null,
        requestedMailboxCount,
        confirmedProviderWrites,
        receipts,
        reasonCodes: ['provider-write-outcome-unknown-do-not-retry-until-reconciled'],
        externalEffectAuthority: 'NONE',
        sendAuthorityCreated: false
      };
    }

    return {
      ok: false,
      version: UBERINBOXES_VERSION,
      status: 'UBERINBOXES_PROVISIONING_FAILED',
      provider: provider || null,
      requestedMailboxCount,
      confirmedProviderWrites,
      receipts,
      reasonCodes: [status ? `provider-refused:${status.toLowerCase()}` : 'provider-refused'],
      externalEffectAuthority: 'NONE',
      sendAuthorityCreated: false
    };
  }

  return {
    ok: true,
    version: UBERINBOXES_VERSION,
    status: 'UBERINBOXES_PROVIDER_WRITES_ACCEPTED_RECONCILIATION_REQUIRED',
    provider: provider || null,
    requestedMailboxCount,
    confirmedProviderWrites,
    receipts,
    reconciliationRequired: true,
    externalEffectAuthority: 'NONE',
    sendAuthorityCreated: false,
    truthBoundary: 'Accepted provider writes are not proof that every mailbox exists, is authenticated, receives replies, is warmed, is deliverable, or is authorized to send. Reconcile provider inventory before promotion.'
  };
}

export async function reconcileUberInboxes({ providerAdapter, fleet } = {}) {
  if (!providerAdapter || typeof providerAdapter.listMailboxes !== 'function' || !fleet?.fleetDigest) {
    return {
      ok: false,
      version: UBERINBOXES_VERSION,
      status: 'UBERINBOXES_RECONCILIATION_BLOCKED',
      reasonCodes: ['provider-list-mailboxes-and-valid-fleet-required'],
      externalEffectAuthority: 'NONE'
    };
  }
  const result = await providerAdapter.listMailboxes({});
  if (!result?.ok) {
    return {
      ok: false,
      version: UBERINBOXES_VERSION,
      status: 'UBERINBOXES_RECONCILIATION_FAILED',
      providerStatus: result?.status || 'UNKNOWN',
      externalEffectAuthority: 'NONE'
    };
  }
  const observed = new Set((Array.isArray(result.mailboxes) ? result.mailboxes : [])
    .map(item => text(item?.address, 320).toLowerCase())
    .filter(Boolean));
  const target = fleet.desired.map(item => item.address.toLowerCase());
  const confirmed = target.filter(address => observed.has(address));
  const missing = target.filter(address => !observed.has(address));
  return {
    ok: true,
    version: UBERINBOXES_VERSION,
    status: missing.length ? 'UBERINBOXES_PARTIALLY_OBSERVED' : 'UBERINBOXES_FULLY_OBSERVED',
    desiredMailboxCount: target.length,
    observedMailboxCount: confirmed.length,
    confirmedAddresses: confirmed,
    missingAddresses: missing,
    externalEffectAuthority: 'NONE',
    sendAuthorityCreated: false
  };
}
