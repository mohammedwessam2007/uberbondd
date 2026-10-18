/**
 * Sovereign UberWarm control-plane integration for Winnr's already-owned fleet.
 *
 * Only real, fully paginated provider GET inventory may enter. A provider-reported
 * Active mailbox is not signed SMTP/HTTPS sending permission and never becomes
 * AUTHENTICATED here. No seed, consent, engagement or reputation is synthesized.
 * This is a 0-cost, 0-send risk-control evaluation, NOT a warming scheduler.
 */
import { compileUberWarmFleet } from './uberwarm-reputation-lab.mjs';

export const UBERWARM2_SOVEREIGN_OBSERVER_VERSION = 'uberbond.uberwarm2-sovereign-live-observer.v1';
const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalize = value => String(value ?? '').trim().toLowerCase();
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const refused = reason => Object.freeze({
  version: UBERWARM2_SOVEREIGN_OBSERVER_VERSION,
  status: 'SOVEREIGN_CONTROL_OBSERVATION_REFUSED', reasonCodes: [reason],
  fleetMailboxes: 0, observedDomains: 0, providerReportedActive: 0,
  unverifiedMailboxIdentity: 0, duplicateIdentity: 0,
  states: {BLOCKED: 0, WARMING: 0, LIMITED_CANARY: 0, RAMP: 0, HOLD: 0, QUARANTINED: 0},
  recommendedColdDailyCap: 0, admittedToSend: 0, inboxPlacements: 0,
  monitoringActive: false, sendingActive: false, providerWarmupAddonRequired: false,
  providerPaidWarmupEnabledByUberBond: false, providerCalls: 0, messagesSent: 0, spendCents: 0,
  externalEffectAuthority: 'NONE'
});

/**
 * All mailbox identities remain in process only and are reduced to aggregate
 * state counts. Future signed external observations must flow through the
 * existing protected approval and ledger chain, not be appended to this API.
 * @param {object} input an entire fresh Winnr account GET inventory
 */
export function compileUberWarm2SovereignLiveObservation({mailboxes, domains, now = new Date()} = {}) {
  if (!Array.isArray(mailboxes) || !Array.isArray(domains)) return refused('complete-provider-inventory-required');
  if (mailboxes.length > 10000 || domains.length > 10000) return refused('inventory-size-out-of-bounds');
  const when = new Date(now);
  if (!Number.isFinite(when.getTime())) return refused('valid-observation-clock-required');
  const domainSet = new Set();
  for (const row of domains) {
    if (!row || typeof row !== 'object') return refused('invalid-domain-row');
    const domain = normalize(row.domain ?? row.name);
    if (!domain || !/^[a-z0-9.-]+$/.test(domain) || domainSet.has(domain))
      return refused('missing-or-duplicate-domain');
    domainSet.add(domain);
  }
  if (!mailboxes.length || !domains.length) return refused('nonempty-current-fleet-required');
  const mailboxSet = new Set();
  let active = 0, invalid = 0, duplicate = 0;
  const fleet = [];
  for (const row of mailboxes) {
    if (!row || typeof row !== 'object') return refused('invalid-mailbox-row');
    const email = normalize(row.full_address ?? row.email ?? row.address ??
      (row.username && row.domain ? `${row.username}@${row.domain}` : ''));
    if (!validEmail.test(email) || !domainSet.has(email.split('@')[1])) { invalid++; continue; }
    if (mailboxSet.has(email)) { duplicate++; continue; }
    mailboxSet.add(email);
    const status = normalize(row.status);
    if (status === 'active') active++;
    fleet.push({
      mailboxId: email, address: email,
      // Provider Active is NOT transport authentication. Only signed protected
      // preflight readers can grant that, and this observer never calls them.
      authenticationStatus: 'UNVERIFIED',
      paused: status !== 'active',
      warmupMode: 'EVIDENCE_RAMP', currentDailyCap: 0
    });
  }
  const report = compileUberWarmFleet({mailboxes: fleet, observationsByMailbox: {}, now: when});
  const states = Object.fromEntries(['BLOCKED', 'WARMING', 'LIMITED_CANARY', 'RAMP', 'HOLD', 'QUARANTINED']
    .map(key => [key, count(report.decisions.filter(row => row.state === key).length)]));
  return Object.freeze({
    version: UBERWARM2_SOVEREIGN_OBSERVER_VERSION,
    status: duplicate || invalid ? 'SOVEREIGN_CONTROL_IDENTITY_HOLD' : 'SOVEREIGN_CONTROL_MONITORING_ACTIVE',
    reasonCodes: [
      ...(duplicate ? ['duplicate-provider-mailbox-identity'] : []),
      ...(invalid ? ['unmatched-or-invalid-provider-mailbox-identity'] : []),
      'independent-authentication-consent-and-placement-still-required'
    ],
    fleetMailboxes: mailboxes.length, observedDomains: domainSet.size,
    providerReportedActive: active, unverifiedMailboxIdentity: invalid, duplicateIdentity: duplicate,
    states, recommendedColdDailyCap: 0, admittedToSend: 0, inboxPlacements: 0,
    monitoringActive: true, sendingActive: false,
    providerWarmupAddonRequired: false, providerPaidWarmupEnabledByUberBond: false,
    providerCalls: 0, messagesSent: 0, spendCents: 0, externalEffectAuthority: 'NONE'
  });
}
