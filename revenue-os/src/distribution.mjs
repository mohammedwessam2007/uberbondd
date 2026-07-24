// 24/7 Continuous Revenue Core, section 6: Distribution Engine -- provider-neutral adapters.
//
// This module does not re-implement sending: whatever ultimately clears every gate below still
// goes through outbound.mjs's own createSendHandoff, which is itself structurally incapable of a
// real send (see that file's own header comment -- no live provider exists anywhere in this
// package, only the in-memory fake-replay one). What this module adds is a *channel-category* layer
// above that, matching the mission's own five named categories: compliant business email, approved
// business/vendor inquiry channels, RFP and marketplace proposals, agency and partner pipelines,
// and inbound scanner leads.
//
// Two independent flags gate every adapter, and both must pass:
//   - `automationPermitted` (platform-fixed, defined here, never true for any adapter in this
//     package -- there is no real email/form/portal automation implemented, so claiming permission
//     to automate would be a lie even if an owner policy later enables the adapter)
//   - the caller-supplied `policy.enabled`/`policy.dryRun` (owner-controlled, per the mission's own
//     required defaults: enabled=false, dry-run=true -- and matches the campaign-policy shape
//     section 7 defines)
// A channel medium not already in importer.mjs's ALLOWED_CHANNELS is rejected regardless of
// adapter, the same "fail unless affirmatively matched" discipline channel-safety.mjs and
// importer.mjs already use -- the explicit PROHIBITED_MEDIUM_HINTS list below exists only for
// disclosure/test coverage, it is never the actual gating mechanism.
import { ALLOWED_CHANNELS } from './importer.mjs';
import { createSendHandoff } from './outbound.mjs';

export class DistributionError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'DistributionError';
    this.code = code;
  }
}

export const DISTRIBUTION_ADAPTERS = Object.freeze({
  business_email: Object.freeze({
    key: 'business_email', label: 'Compliant business email',
    acceptedMediums: Object.freeze(['published_email']),
    automationPermitted: false,
    prohibitedNotes: Object.freeze(['No CAPTCHA-gated submission.', 'No support/service inboxes.', 'No inferred or guessed addresses -- published and verified only.'])
  }),
  vendor_inquiry_channel: Object.freeze({
    key: 'vendor_inquiry_channel', label: 'Approved business/vendor inquiry channel',
    acceptedMediums: Object.freeze(['published_contact_form', 'public_directory_listing']),
    automationPermitted: false,
    prohibitedNotes: Object.freeze(['Only a form whose own terms permit automated submission.', 'No CAPTCHA bypass.', 'No support-ticket-shaped forms.'])
  }),
  rfp_marketplace: Object.freeze({
    key: 'rfp_marketplace', label: 'RFP and marketplace proposals',
    acceptedMediums: Object.freeze(['public_directory_listing', 'published_contact_form']),
    automationPermitted: false,
    prohibitedNotes: Object.freeze(['Only a listing explicitly open for proposals.', 'No account creation or credential entry performed automatically.'])
  }),
  agency_partner_pipeline: Object.freeze({
    key: 'agency_partner_pipeline', label: 'Agency and partner pipelines',
    acceptedMediums: Object.freeze(['referral_intro', 'linkedin_public_profile']),
    automationPermitted: false,
    prohibitedNotes: Object.freeze(['Referral/partner introductions only -- never a cold, unrelated third party routed through this adapter.'])
  }),
  inbound_scanner_leads: Object.freeze({
    key: 'inbound_scanner_leads', label: 'Inbound scanner leads',
    acceptedMediums: Object.freeze(['published_contact_form', 'published_email']),
    automationPermitted: false,
    prohibitedNotes: Object.freeze(['Only a lead that already reached out inbound -- never a cold contact routed through this adapter.'])
  })
});

export const DISTRIBUTION_ADAPTER_KEYS = Object.freeze(Object.keys(DISTRIBUTION_ADAPTERS));

// Disclosed, not load-bearing: importer.mjs's ALLOWED_CHANNELS already excludes every one of these
// by construction (they were never added to that allowlist), so this list can never change what
// preflightDistribution actually rejects. It exists so a reviewer can see, by name, exactly which
// channel shapes this engine refuses to automate, per the mission's own explicit list.
export const PROHIBITED_MEDIUM_HINTS = Object.freeze(['captcha_gated_form', 'support_form', 'customer_service_form', 'personal_dm', 'sms', 'phone_call']);

export const DEFAULT_DISTRIBUTION_POLICY = Object.freeze({ enabled: false, dryRun: true });

export function listDistributionAdapters() {
  return Object.values(DISTRIBUTION_ADAPTERS);
}

/**
 * Reports every reason a dispatch through `adapterKey` would be refused, never just the first --
 * same discipline as importer.mjs#normalizeRecord and channel-safety.mjs#preflightChannelSafety.
 * Never throws for a bad *input* (only `dispatchThroughAdapter` below throws, on `ok: false`).
 */
export function preflightDistribution({ adapterKey, medium, verified, inferredBasis, termsPermitAutomation = true, policy = {} } = {}) {
  const adapter = DISTRIBUTION_ADAPTERS[adapterKey];
  if (!adapter) return { ok: false, reasons: ['unknown-adapter'] };

  const effectivePolicy = { ...DEFAULT_DISTRIBUTION_POLICY, ...policy };
  const reasons = [];
  const normalizedMedium = String(medium || '').trim();

  if (!effectivePolicy.enabled) reasons.push('adapter-disabled-by-policy');
  if (!adapter.automationPermitted) reasons.push('automation-not-permitted-for-channel-category');
  if (PROHIBITED_MEDIUM_HINTS.includes(normalizedMedium)) reasons.push('explicitly-prohibited-channel');
  if (!adapter.acceptedMediums.includes(normalizedMedium)) reasons.push('medium-not-accepted-by-adapter');
  if (!ALLOWED_CHANNELS.includes(normalizedMedium)) reasons.push('medium-not-globally-allowed');
  if (!verified && !inferredBasis) reasons.push('inferred-contact-without-basis');
  if (termsPermitAutomation === false) reasons.push('channel-terms-forbid-automation');

  if (reasons.length) return { ok: false, reasons };
  return { ok: true, dryRun: effectivePolicy.dryRun !== false };
}

/**
 * The one function that actually routes a prepared send through a distribution adapter. Refuses
 * (throws DistributionError, never silently no-ops) unless preflightDistribution reports `ok:
 * true` -- which, today, it never can, because every adapter's `automationPermitted` is `false`
 * (no real email/form/portal automation exists in this package). This is deliberate: the function
 * is wired end-to-end now so a future adapter that legitimately implements one of the five
 * categories routes through this exact gate and the exact same outbound.mjs handoff path, never a
 * second send implementation.
 */
export async function dispatchThroughAdapter(store, { adapterKey, medium, verified, inferredBasis, termsPermitAutomation, policy, approval, draft, opportunity, provider, config } = {}) {
  const preflight = preflightDistribution({ adapterKey, medium, verified, inferredBasis, termsPermitAutomation, policy });
  if (!preflight.ok) throw new DistributionError('distribution-blocked', preflight.reasons.join(', '));
  const mode = preflight.dryRun ? 'dry-run' : (config?.outboundMode || 'dry-run');
  return createSendHandoff(store, { approval, draft, opportunity, mode, provider, config });
}
