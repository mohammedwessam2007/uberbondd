import crypto from 'node:crypto';
import { compileCommunicationCommand } from './omnichannel-communication-contract.mjs';

export const SOCIAL_PUBLICATION_SCHEDULE_POLICY_VERSION = 'social-publication-schedule-contract-1.0.0';

const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const SENSITIVE_KEYS = /(?:message|body|text|caption|raw(?:payload|body|content)|password|secret|token|authorization|cookie|credential|api[_-]?key|recipient|destination|handle|username)/i;
const SAFE_REFERENCE_KEYS = new Set([
  'contentRef', 'audienceRef', 'platformPolicyRef', 'publicationPolicyRef',
  'authorityReceiptRef', 'communicationPolicyRef', 'idempotencyKey'
]);

function clone(value) { return structuredClone(value); }
function text(value, max = 240) {
  const string = String(value ?? '').trim();
  return string && string.length <= max ? string : null;
}
function iso(value) {
  const string = text(value, 80);
  if (!string) return null;
  const date = new Date(string);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function invalid(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: SOCIAL_PUBLICATION_SCHEDULE_POLICY_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS),
    ...extra
  };
}
function sensitiveKeys(value, depth = 0, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || depth > 6) return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const found = [];
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(String(key)) && !SAFE_REFERENCE_KEYS.has(String(key))) found.push(String(key));
    if (child && typeof child === 'object') found.push(...sensitiveKeys(child, depth + 1, seen));
  }
  return [...new Set(found)].slice(0, 20);
}

export function compileSocialPublicationSchedule(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return invalid(['social-publication-schedule-object-required']);
  }
  const scheduleKey = text(input.scheduleKey, 300);
  const contentRef = text(input.contentRef, 240);
  const audienceRef = text(input.audienceRef, 200);
  const publicationPolicyRef = text(input.publicationPolicyRef, 240);
  const platformPolicyRef = text(input.platformPolicyRef, 240);
  const scheduledFor = iso(input.scheduledFor);
  const createdAt = iso(input.createdAt);
  const reasonCodes = [];
  if (!scheduleKey) reasonCodes.push('schedule-key-required-or-too-long');
  if (!contentRef) reasonCodes.push('content-ref-required');
  if (!audienceRef) reasonCodes.push('audience-ref-required');
  if (!publicationPolicyRef) reasonCodes.push('publication-policy-ref-required');
  if (!platformPolicyRef) reasonCodes.push('planned-platform-policy-ref-required');
  if (!scheduledFor) reasonCodes.push('scheduled-for-required');
  if (!createdAt) reasonCodes.push('created-at-required');
  if (scheduledFor && createdAt && new Date(scheduledFor).getTime() < new Date(createdAt).getTime() - 300_000) {
    reasonCodes.push('scheduled-publication-materially-before-plan-creation');
  }
  const prohibited = sensitiveKeys(input);
  if (prohibited.length) reasonCodes.push('raw-social-content-recipient-or-secret-prohibited');
  const schedule = {
    schemaVersion: 'social-publication-schedule-1.0.0',
    scheduleKey,
    contentRef,
    audienceRef,
    publicationPolicyRef,
    plannedPlatformPolicyRef: platformPolicyRef,
    scheduledFor,
    createdAt,
    schedulerBoundary: 'CANONICAL_SCHEDULER_OWNS_DUE_OCCURRENCE',
    executionLaw: 'FRESH_AUTHORITY_AND_CURRENT_PLATFORM_POLICY_REQUIRED_AT_DUE_OCCURRENCE',
    durablePayloadClass: 'REFERENCE_ONLY_NO_RAW_CONTENT_OR_ACCOUNT_CREDENTIALS'
  };
  schedule.scheduleId = scheduleKey && contentRef && audienceRef && scheduledFor
    ? `social_sched_${digest(schedule).slice(0, 32)}`
    : null;
  if (reasonCodes.length) return invalid(reasonCodes, { schedule, prohibitedKeys: prohibited });
  return {
    ok: true,
    policyVersion: SOCIAL_PUBLICATION_SCHEDULE_POLICY_VERSION,
    status: 'LOCAL_PUBLICATION_SCHEDULE_PREPARED',
    schedule,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function compileDueSocialPublicationCommand({
  schedule,
  dueOccurrenceKey,
  now,
  authorityReceiptRef,
  idempotencyKey,
  communicationPolicyRef,
  currentPlatformPolicyRef
} = {}) {
  if (!schedule?.scheduleId || schedule.schemaVersion !== 'social-publication-schedule-1.0.0') {
    return invalid(['valid-social-publication-schedule-required']);
  }
  const occurrenceKey = text(dueOccurrenceKey, 300);
  const observedNow = iso(now);
  const authorityRef = text(authorityReceiptRef, 240);
  const idempotency = text(idempotencyKey, 300);
  const communicationPolicy = text(communicationPolicyRef, 240);
  const platformPolicy = text(currentPlatformPolicyRef, 240);
  const reasonCodes = [];
  if (!occurrenceKey) reasonCodes.push('due-occurrence-key-required-or-too-long');
  if (!observedNow) reasonCodes.push('valid-now-required');
  if (observedNow && new Date(observedNow).getTime() + 300_000 < new Date(schedule.scheduledFor).getTime()) {
    reasonCodes.push('publication-occurrence-not-due');
  }
  if (!authorityRef) reasonCodes.push('fresh-authority-receipt-ref-required-at-execution');
  if (!idempotency) reasonCodes.push('idempotency-key-required-at-execution');
  if (!communicationPolicy) reasonCodes.push('current-communication-policy-ref-required-at-execution');
  if (!platformPolicy) reasonCodes.push('current-platform-policy-ref-required-at-execution');
  if (reasonCodes.length) return invalid(reasonCodes, { scheduleId: schedule.scheduleId });

  const communication = compileCommunicationCommand({
    channel: 'SOCIAL_PUBLIC',
    purpose: 'PUBLIC_DISTRIBUTION',
    occurrenceKey,
    audienceRef: schedule.audienceRef,
    contentRef: schedule.contentRef,
    authorityReceiptRef: authorityRef,
    idempotencyKey: idempotency,
    communicationPolicyRef: communicationPolicy,
    platformPolicyRef: platformPolicy
  });
  if (!communication?.ok) {
    return invalid(['canonical-communication-command-rejected'], {
      scheduleId: schedule.scheduleId,
      communicationReasonCodes: communication?.reasonCodes || []
    });
  }
  return {
    ok: true,
    policyVersion: SOCIAL_PUBLICATION_SCHEDULE_POLICY_VERSION,
    status: 'DUE_SOCIAL_PUBLICATION_COMMAND_PREPARED',
    scheduleId: schedule.scheduleId,
    dueOccurrenceKey: occurrenceKey,
    communicationCommand: communication.command,
    publicationTruthAuthority: 'NONE_UNTIL_PROVIDER_RECEIPT_IS_NORMALIZED_BY_OMNICHANNEL_CONTRACT',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}
