// Outreach drift doctor: catches material divergence between
//   current source  <->  current handoff  <->  current hot pointer
//   <->  current provider-state representation.
//
// It never edits anything. Historical statements are allowed to remain in
// history; they are drift only when a CURRENT document asserts them without a
// supersession marker while current source or current observed state says
// otherwise. Every finding names the exact file, the claim, and the source fact
// that contradicts it.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { providerRoutePolicy } from './outreach-governance.mjs';

export const OUTREACH_DRIFT_DOCTOR_VERSION = 'uberbond.outreach-drift-doctor.v1';
const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Documents that present themselves as current truth.
export const CURRENT_DOCUMENTS = Object.freeze([
  '00_OUTREACH_NOW.md', 'docs/handoffs/OUTREACH_COMMERCIAL_CURRENT.md', 'winnr/CURRENT_STATE.md', 'winnr/README.md', 'winnr/NEXT_STEPS.md'
]);

const SUPERSESSION_MARKER = /\b(superseded|supersedes|historical|history|formerly|was true|no longer|older|previously|stale|lineage|preserved)\b/i;

// Historical claims that must never masquerade as current truth. Each carries
// the source/state predicate that decides whether the claim is currently false.
export const STALE_CLAIM_RULES = Object.freeze([
  { id: 'no-mail-host', pattern: /\bno (mail host|mailbox host|smtp host) (exists|is available|available)\b/i, falseWhen: ctx => ctx.exists('src/uberfleet.mjs') && ctx.exists('src/ubersmtp-submission-adapter.mjs') && (ctx.winnr?.runtime?.smtpConfirmed || 0) > 0, because: 'SMTP fleet transport source exists and winnr/CURRENT_STATE.json observes SMTP confirmed mailboxes' },
  { id: 'reply-taxonomy-absent', pattern: /\breply taxonomy (is )?(absent|missing|does not exist|not implemented)\b/i, falseWhen: ctx => ctx.exists('src/uberreply-taxonomy.mjs') && /uberreply-taxonomy/.test(ctx.read('src/ai.mjs') || ''), because: 'src/uberreply-taxonomy.mjs exists and src/ai.mjs (production reply classification) imports it' },
  { id: 'no-provider-configured', pattern: /\bno (sender |mail |smtp )?provider (is )?(configured|connected)\b/i, falseWhen: ctx => Boolean(ctx.winnr?.provider?.name), because: 'winnr/CURRENT_STATE.json records the provider' },
  { id: 'no-authenticated-mailbox', pattern: /\bno authenticated (smtp |imap )?mailbox(es)?\b/i, falseWhen: ctx => (ctx.winnr?.runtime?.smtpConfirmed || 0) > 0, because: 'winnr/CURRENT_STATE.json records SMTP/IMAP confirmed mailboxes' },
  { id: 'all-senders-spam', pattern: /\ball (three )?senders (are |land |landed )?(in )?spam\b|\bglobal placement (is )?red\b/i, falseWhen: ctx => (ctx.winnr?.placement?.inboxOrdinals || []).length > 0, because: 'winnr/CURRENT_STATE.json records inbox placements for ordinals 1 and 2' },
  { id: 'cold-route-absent', pattern: /\bno cold[- ]route (exists|is implemented)\b|\bcold route (is )?(absent|missing|does not exist)\b/i, falseWhen: ctx => ctx.exists('src/outreach-cold-route-policy.mjs'), because: 'src/outreach-cold-route-policy.mjs exists' },
  { id: 'global-route-absent', pattern: /\bno (global )?(green[- ]lane|jurisdiction|route) router\b|\b(global )?(green[- ]lane|jurisdiction) router (is )?(absent|missing|does not exist|not implemented)\b/i, falseWhen: ctx => ctx.exists('src/global-green-lane-router.mjs') && /global-green-lane-router/.test(ctx.read('src/prospect-preflight.mjs') || ''), because: 'src/global-green-lane-router.mjs exists and src/prospect-preflight.mjs imports it' },
  { id: 'prospect-preflight-absent', pattern: /\b(no|missing) (generic )?prospect[- ]preflight\b/i, falseWhen: ctx => ctx.exists('src/prospect-preflight.mjs'), because: 'src/prospect-preflight.mjs exists and is production reachable' }
]);

// Claims that the cold route is live. Source says it is not self-authorizing and
// the smtp-relay provider policy still refuses PUBLIC_BUSINESS_CONTACT.
const COLD_ROUTE_ENABLED_CLAIM = /\bcold route (is )?(enabled|live|active|wired into (the )?(send|dispatch) path)\b|COLD_ROUTE_ENABLED\s*[:=]\s*TRUE\b/i;

function lines(text) { return String(text || '').split('\n'); }

export function compileOutreachDriftReport({
  root = defaultRoot,
  read = file => (existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null),
  exists = file => existsSync(join(root, file))
} = {}) {
  const findings = [];
  const add = (check, file, detail, severity = 'DRIFT') => findings.push({ check, file, severity, detail });
  const json = file => { try { return JSON.parse(read(file)); } catch { return null; } };

  const winnr = json('winnr/CURRENT_STATE.json');
  const hot = json('00_OUTREACH_NOW.json');
  const handoff = json('docs/CURRENT_HANDOFF.json');
  const ctx = { exists, read, winnr };

  // 1. Pointer integrity: every path a current pointer names must exist.
  const pointed = [];
  if (hot) for (const key of ['primaryPointer', 'genomePath', 'offerPath', 'winnrRecoveryRoot', 'winnrCurrentObservations', 'winnrReconciliationReceipt']) if (hot[key]) pointed.push(['00_OUTREACH_NOW.json', hot[key]]);
  const section = handoff?.winnrActivationReconciliation20261002;
  if (section) for (const key of ['recoveryRoot', 'currentObservations', 'evidenceReceipt', 'personalSeedEvidenceRef']) if (section[key]) pointed.push(['docs/CURRENT_HANDOFF.json', section[key]]);
  if (winnr) for (const key of ['canonicalEvidenceRef']) if (winnr[key]) pointed.push(['winnr/CURRENT_STATE.json', winnr[key]]);
  if (winnr?.runtime?.evidenceRef) pointed.push(['winnr/CURRENT_STATE.json', winnr.runtime.evidenceRef]);
  if (winnr?.placement?.personalSeedExperiment?.evidenceRef) pointed.push(['winnr/CURRENT_STATE.json', winnr.placement.personalSeedExperiment.evidenceRef]);
  for (const [file, ref] of pointed) if (!exists(String(ref))) add('POINTER_INTEGRITY', file, `points at ${ref}, which does not exist`);
  if (!hot) add('POINTER_INTEGRITY', '00_OUTREACH_NOW.json', 'hot pointer is missing or not valid JSON');
  if (!winnr) add('POINTER_INTEGRITY', 'winnr/CURRENT_STATE.json', 'provider-state representation is missing or not valid JSON');

  // 2. Provider-state representation consistency (hot pointer / handoff / state file).
  if (winnr && section) {
    const same = (label, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) add('PROVIDER_STATE_CONSISTENCY', 'docs/CURRENT_HANDOFF.json', `${label}: handoff says ${JSON.stringify(a)} but winnr/CURRENT_STATE.json says ${JSON.stringify(b)}`); };
    same('smtpConfirmed', section.smtpConfirmed, winnr.runtime?.smtpConfirmed);
    same('imapConfirmed', section.imapConfirmed, winnr.runtime?.imapConfirmed);
    same('smtpQuarantinedOrdinals', section.smtpQuarantinedOrdinals, winnr.runtime?.smtpQuarantinedOrdinals);
    same('technicalActivation', section.technicalActivation, winnr.technicalActivation);
    same('campaignActivation', section.campaignActivation, winnr.campaignActivation);
  }
  if (winnr && hot) {
    if (hot.winnrCurrentObservations && hot.winnrCurrentObservations !== 'winnr/CURRENT_STATE.json') add('PROVIDER_STATE_CONSISTENCY', '00_OUTREACH_NOW.json', 'winnrCurrentObservations does not point at winnr/CURRENT_STATE.json');
  }
  // The quarantine the state file declares must be what the allocator would honour: ordinal 3 is never "released" by a document.
  if (winnr?.placement?.personalSeedExperiment?.quarantineReleased === true) add('PROVIDER_STATE_CONSISTENCY', 'winnr/CURRENT_STATE.json', 'quarantineReleased is true but release requires new matched evidence under the existing policy');

  // 3. Stale historical claims masquerading as current truth.
  for (const file of CURRENT_DOCUMENTS) {
    const text = read(file);
    if (text === null) continue;
    const all = lines(text);
    all.forEach((line, index) => {
      for (const rule of STALE_CLAIM_RULES) {
        if (!rule.pattern.test(line)) continue;
        const near = all.slice(Math.max(0, index - 2), index + 3).join(' ');
        if (SUPERSESSION_MARKER.test(near)) continue;
        if (rule.falseWhen(ctx)) add('STALE_CLAIM_MASQUERADING_AS_CURRENT', file, `line ${index + 1} asserts "${rule.id}" without a supersession marker, but ${rule.because}`);
      }
    });
  }

  // 4. The cold route is not live: documents must not claim it is.
  const coldRefused = providerRoutePolicy('smtp-relay', 'PUBLIC_BUSINESS_CONTACT').ok === false;
  for (const file of [...CURRENT_DOCUMENTS, 'docs/CURRENT_HANDOFF.json']) {
    const text = read(file);
    if (text === null) continue;
    lines(text).forEach((line, index) => {
      if (!COLD_ROUTE_ENABLED_CLAIM.test(line)) return;
      if (/\b(not|never|until|false|disabled|before|requires?|unless|inert|unwired)\b/i.test(line)) return;
      if (coldRefused) add('COLD_ROUTE_CLAIMED_LIVE', file, `line ${index + 1} claims the cold route is live, but providerRoutePolicy('smtp-relay','PUBLIC_BUSINESS_CONTACT') still refuses it`);
    });
  }

  // 5. Founder one-button: every endpoint the button calls must exist in the server.
  const button = read('public/outreach-one-button.js');
  if (button !== null) {
    const serverText = `${read('server.mjs') || ''}\n${read('server-core.mjs') || ''}`;
    const called = [...new Set([...button.matchAll(/['"`](\/api\/[a-zA-Z0-9/_-]+)['"`]/g)].map(m => m[1]))];
    for (const route of called) if (!serverText.includes(route)) add('ONE_BUTTON_ROUTE_MISSING', 'public/outreach-one-button.js', `calls ${route}, which no server route defines`);
    if (/compileUberLaunchRuntimeEvidence|prepareSovereignOneButtonLaunch/.test(button)) add('ONE_BUTTON_WEAKER_MODEL', 'public/outreach-one-button.js', 'the founder button must consume canonical server readiness, not an in-browser launch model');
    // The button may say STARTED only on the response of a canonical start route.
    if (/STARTED/.test(button) && !/\/api\/outreach\/100k\/start|\/api\/outbound\/canary\/start/.test(button)) add('ONE_BUTTON_WEAKER_MODEL', 'public/outreach-one-button.js', 'STARTED is reported without a canonical start route');
  }

  return Object.freeze({
    version: OUTREACH_DRIFT_DOCTOR_VERSION,
    ok: findings.length === 0,
    findings,
    checks: ['POINTER_INTEGRITY', 'PROVIDER_STATE_CONSISTENCY', 'STALE_CLAIM_MASQUERADING_AS_CURRENT', 'COLD_ROUTE_CLAIMED_LIVE', 'ONE_BUTTON_ROUTE_MISSING', 'ONE_BUTTON_WEAKER_MODEL'],
    readOnly: true, externalEffects: 0
  });
}
