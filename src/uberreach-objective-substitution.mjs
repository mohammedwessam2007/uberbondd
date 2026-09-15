import crypto from 'node:crypto';
import { compileUniversalReachPlan } from './uberreach-universal-transport.mjs';

const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = value => String(value ?? '').trim();
const uniq = values => [...new Set(values)];

export const ECONOMIC_REACH_TARGET = 100_000;

export function compileObjectiveSubstitution({
  opportunities = [],
  endpoints = [],
  smtpCertificate = null,
  target = ECONOMIC_REACH_TARGET,
  now = new Date()
} = {}) {
  const targetCount = Number.isFinite(Number(target)) && Number(target) > 0 ? Math.floor(Number(target)) : ECONOMIC_REACH_TARGET;
  const plan = compileUniversalReachPlan({ opportunities, endpoints, now });

  const seenRecipients = new Set();
  const seenEndpointPairs = new Set();
  const admissibleRoutes = [];
  const duplicateRoutes = [];

  for (const route of plan.routes || []) {
    const recipientId = clean(route.recipientId);
    const endpointId = clean(route.endpointId);
    const channel = clean(route.channel).toUpperCase();
    const pair = `${recipientId}::${endpointId}`;
    if (!recipientId || !endpointId) continue;
    if (seenRecipients.has(recipientId) || seenEndpointPairs.has(pair)) {
      duplicateRoutes.push({ recipientId, endpointId, channel });
      continue;
    }
    seenRecipients.add(recipientId);
    seenEndpointPairs.add(pair);
    admissibleRoutes.push({ recipientId, endpointId, channel, opportunityId: clean(route.opportunityId) || null });
  }

  const byChannel = {};
  for (const route of admissibleRoutes) byChannel[route.channel] = (byChannel[route.channel] || 0) + 1;

  const emailReach = byChannel.EMAIL || 0;
  const nonEmailReach = admissibleRoutes.length - emailReach;
  const smtpReady = smtpCertificate?.state === 'CERTIFIED_100K_READY' && smtpCertificate?.oneButton100kPressAvailable === true;
  const uniqueReachableRecipients = admissibleRoutes.length;
  const remainingToTarget = Math.max(0, targetCount - uniqueReachableRecipients);

  const state = uniqueReachableRecipients >= targetCount
    ? 'ECONOMIC_REACH_TARGET_READY'
    : uniqueReachableRecipients > 0
      ? 'PARTIAL_ECONOMIC_REACH'
      : 'NO_LEGITIMATE_REACH';

  const seed = {
    state,
    target: targetCount,
    uniqueReachableRecipients,
    remainingToTarget,
    byChannel,
    smtpReady,
    smtpEquivalent: false
  };

  return {
    ...seed,
    substitutionId: `uberreach_sub_${sha256(seed)}`,
    routes: admissibleRoutes,
    duplicateRoutes,
    unreachable: plan.unreachable || [],
    substitution: {
      emailReach,
      nonEmailReach,
      canReduceSmtpDependence: nonEmailReach > 0,
      replacesSmtpCertificate: false
    },
    automaticContactAuthority: false,
    automaticSendAuthority: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'This compiler can substitute the objective from 100,000 SMTP sends to 100,000 unique recipients with fresh, public-or-authorized, terms-compatible reachable endpoints. It does not bypass provider limits, suppression, recipient authorization, platform rules, or the SMTP certificate; it does not contact anyone. Each consequential contact still requires its own current authority and channel-specific gate.'
  };
}
