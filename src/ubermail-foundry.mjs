import crypto from 'node:crypto';
import { UBERDOSO_ROOTS } from './uberdoso-kernel.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERMAIL_FOUNDRY_VERSION = 'uberbond.ubermail-foundry.v1';
export const UBERMAIL_FOUNDRY_BACKEND = 'STALWART_COMMUNITY';

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function zero(extra = {}) {
  return {
    version: UBERMAIL_FOUNDRY_VERSION,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function alias(index) {
  return `mohamed.${String(index + 1).padStart(3, '0')}`;
}

/**
 * Compile sovereign mailbox identities for an owned Stalwart deployment.
 * Identity count is not reputation, egress, deliverability or send authority.
 */
export function compileUberMailFoundry({
  roots = UBERDOSO_ROOTS,
  accountsPerRoot = 100,
  replyMasterLocalPart = 'replies',
  existingAccounts = []
} = {}) {
  const canonical = [...UBERDOSO_ROOTS].sort();
  const supplied = [...new Set((Array.isArray(roots) ? roots : []).map(value => clean(value, 253).toLowerCase()).filter(Boolean))].sort();
  if (supplied.length !== canonical.length || supplied.some((value, index) => value !== canonical[index])) {
    return zero({ ok: false, status: 'UBERMAIL_FOUNDRY_REFUSED', reasonCodes: ['exact-owned-roots-required'] });
  }
  const density = Number(accountsPerRoot);
  if (!Number.isInteger(density) || density < 1 || density > 10000) {
    return zero({ ok: false, status: 'UBERMAIL_FOUNDRY_REFUSED', reasonCodes: ['accounts-per-root-must-be-1-to-10000'] });
  }
  const master = clean(replyMasterLocalPart, 64).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._+-]{0,62}[a-z0-9]$|^[a-z0-9]$/.test(master)) {
    return zero({ ok: false, status: 'UBERMAIL_FOUNDRY_REFUSED', reasonCodes: ['valid-reply-master-local-part-required'] });
  }

  const existing = new Set((Array.isArray(existingAccounts) ? existingAccounts : [])
    .map(item => clean(item?.address || item?.email, 320).toLowerCase())
    .filter(Boolean));
  const accounts = [];
  const replyMasters = supplied.map(domain => `${master}@${domain}`);

  for (const domain of supplied) {
    for (let i = 0; i < density; i += 1) {
      const localPart = alias(i);
      const address = `${localPart}@${domain}`;
      accounts.push({
        accountId: `ubermail:${address}`,
        address,
        domain,
        localPart,
        displayName: 'Mohamed Wessam',
        identityClass: 'FOUNDER_ALIAS',
        backend: UBERMAIL_FOUNDRY_BACKEND,
        replyMaster: `${master}@${domain}`,
        desiredState: 'LOCAL_MAILBOX_ACCOUNT_NOT_AUTHORIZED_TO_COLD_SEND',
        alreadyExists: existing.has(address)
      });
    }
  }

  const missing = accounts.filter(row => !row.alreadyExists);
  const plan = {
    schemaVersion: 'ubermail.foundry-plan.v1',
    backend: UBERMAIL_FOUNDRY_BACKEND,
    roots: supplied,
    accountsPerRoot: density,
    desiredAccountCount: accounts.length,
    existingAccountCount: accounts.length - missing.length,
    missingAccountCount: missing.length,
    replyMasters,
    accounts,
    missing,
    protocolIntent: {
      management: 'JMAP_X_ACCOUNT_SET_OR_EQUIVALENT_VERIFIED_STALWART_ACCOUNT_API',
      mailboxAccess: ['JMAP', 'IMAP'],
      submission: 'SMTP',
      outboundRoutes: ['MX', 'AUTHORIZED_RELAY']
    },
    softwareLicenseCostClaim: 'NO_PER_MAILBOX_LICENSE_ASSUMED; HOSTING_STORAGE_NETWORK_AND_EGRESS_ARE_SEPARATE',
    sendAuthorityCreated: false,
    capacityCreated: {
      mailboxIdentityCapacity: accounts.length,
      coldSendDailyCapacity: 0,
      egressDailyCapacity: 0
    },
    truthBoundary: 'Creating mailbox accounts is not evidence of independent reputation, delivery, warm-up, recipient acceptance or permission to send.',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
  plan.planDigest = digest(plan);
  return zero({
    ok: true,
    status: missing.length ? 'UBERMAIL_FOUNDRY_PLAN_READY' : 'UBERMAIL_FOUNDRY_ACCOUNTS_ALREADY_OBSERVED',
    plan
  });
}
