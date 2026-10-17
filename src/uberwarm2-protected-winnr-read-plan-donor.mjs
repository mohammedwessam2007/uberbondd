// LANE C donor: protected Winnr zero-paid, no-write read plan. This is a pure
// compiler: it performs no provider call, holds no credential, and exposes zero
// write capability. The injected read-only client is validated by shape only and
// is never passed through the returned plan.

export const UBERWARM2_PROTECTED_WINNR_READ_PLAN_VERSION = 'uberbond.uberwarm2-protected-winnr-read-plan.v1';
export const UBERWARM2_PROTECTED_WINNR_READ_PLAN_READY = 'UBERWARM2_WINNR_READ_PLAN_READY';
export const UBERWARM2_PROTECTED_WINNR_READ_PLAN_REFUSED = 'UBERWARM2_WINNR_READ_PLAN_REFUSED';

// Documented GET-only Winnr inventory/DNS/status methods. Names only: the plan
// proposes these and performs no call. No unsupported or undocumented endpoint.
export const UBERWARM2_WINNR_READ_PLAN_APPROVED_GET = Object.freeze([
  'getAccount', 'getUsage', 'listAllDomains', 'getDomain', 'getDnsStatus',
  'getDnsRecords', 'listAllMailboxes', 'getMailbox', 'listJobs', 'getJob', 'lookupMessage'
]);

// Paginated whole-account inventory plus provider DNS health proof. A client
// missing any of these cannot be compiled into a ready read plan (fail closed).
export const UBERWARM2_WINNR_READ_PLAN_REQUIRED = Object.freeze([
  'listAllMailboxes', 'listAllDomains', 'getDnsStatus'
]);

export const UBERWARM2_WINNR_READ_PLAN_DENIED = Object.freeze([
  'paid-warmer-enable', 'purchase-or-billing', 'export-mailbox-credentials',
  'email-user-create-update-delete', 'smtp-send', 'bulk-mail', 'dns-mutation',
  'undocumented-path', 'raw-unrestricted-client-passthrough'
]);

const TRUTH_BOUNDARY = 'Protected Winnr read plan is a pure, zero-paid, no-write description. It reports Startup and pilot mailbox counts separately without asserting provider entitlement or observed payment, proposes documented GET reads only, never calls the provider, holds no credential and exposes zero write capability.';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = v => (typeof v === 'string' && v.trim() ? v.trim() : '');
const lower = v => String(v ?? '').trim().toLowerCase();
const domainOf = v => lower(v).split('@')[1] || '';
const count = v => Number.isSafeInteger(v) && v >= 0 ? v : null;

const refused = reasonCodes => Object.freeze({
  ok: false, ready: false, status: UBERWARM2_PROTECTED_WINNR_READ_PLAN_REFUSED,
  version: UBERWARM2_PROTECTED_WINNR_READ_PLAN_VERSION,
  reasonCodes: Object.freeze(reasonCodes), plan: null,
  approvedGetMethods: UBERWARM2_WINNR_READ_PLAN_APPROVED_GET,
  deniedCapabilities: UBERWARM2_WINNR_READ_PLAN_DENIED,
  writeCapability: 'NONE', credentialsExposed: false, exportPerformed: false,
  providerCalls: 0, externalEffectAuthority: 'NONE', truthBoundary: TRUTH_BOUNDARY
});

export function compileUberWarm2ProtectedWinnrReadPlan({
  mailboxId = '', email = '', domain = '', client = null,
  plan = 'Startup', startupMailboxes = null, pilotMailboxes = null
} = {}) {
  const reasons = [];
  const id = str(mailboxId);
  const sender = lower(email);
  const dom = lower(domain);
  if (!id) reasons.push('exact-mailbox-id-required');
  if (!EMAIL.test(sender)) reasons.push('exact-mailbox-email-required');
  if (!dom) reasons.push('exact-domain-required');
  if (sender && dom && domainOf(sender) !== dom) reasons.push('email-domain-mismatch');
  if (!client || typeof client !== 'object') reasons.push('injected-readonly-client-required');
  reasons.push(...UBERWARM2_WINNR_READ_PLAN_REQUIRED
    .filter(name => typeof client?.[name] !== 'function')
    .map(name => `winnr-read-required:${name}`));
  if (reasons.length) return refused(reasons);

  const name = str(plan) || 'Startup';
  const startup = count(startupMailboxes);
  const pilots = count(pilotMailboxes);
  return Object.freeze({
    ok: true, ready: false, configured: true, providerVerified: false,
    status: UBERWARM2_PROTECTED_WINNR_READ_PLAN_READY,
    version: UBERWARM2_PROTECTED_WINNR_READ_PLAN_VERSION,
    reasonCodes: Object.freeze([]),
    identity: Object.freeze({ mailboxId: id, email: sender, domain: dom }),
    plan: Object.freeze({
      name,
      approvedGetMethods: UBERWARM2_WINNR_READ_PLAN_APPROVED_GET,
      requiredReads: UBERWARM2_WINNR_READ_PLAN_REQUIRED,
      proposedApprovedReads: Object.freeze([
        'listAllDomains?limit=100', 'listAllMailboxes?limit=100',
        'getDnsStatus?domainId', 'getDnsRecords?domainId', 'getMailbox?userId'
      ]),
      startup: Object.freeze({
        tier: 'Startup', mailboxes: startup, expectedOnly: true, entitlement: 'UNVERIFIED',
        paymentObserved: false, guessedEntitlement: false
      }),
      pilots: Object.freeze({
        tier: 'Pilots', mailboxes: pilots, expectedOnly: true, entitlement: 'UNVERIFIED',
        paymentObserved: false, guessedEntitlement: false
      })
    }),
    deniedCapabilities: UBERWARM2_WINNR_READ_PLAN_DENIED,
    writeCapability: 'NONE', credentialsExposed: false, exportPerformed: false,
    providerCalls: 0, externalEffectAuthority: 'NONE', truthBoundary: TRUTH_BOUNDARY
  });
}
