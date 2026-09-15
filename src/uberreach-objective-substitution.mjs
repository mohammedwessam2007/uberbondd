import crypto from 'node:crypto';
import { compileUniversalReachPlan } from './uberreach-universal-transport.mjs';

const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = value => String(value ?? '').trim();

export const ECONOMIC_REACH_TARGET = 100_000;

export function compileObjectiveSubstitution({ opportunities = [], endpoints = [], smtpCertificate = null, target = ECONOMIC_REACH_TARGET, now = new Date() } = {}) {
  const targetCount = Number.isFinite(Number(target)) && Number(target) > 0 ? Math.floor(Number(target)) : ECONOMIC_REACH_TARGET;
  const plan = compileUniversalReachPlan({ opportunities, endpoints, now });
  const seenRecipients = new Set();
  const seenEndpointPairs = new Set();
  const routes = [];
  const duplicateRoutes = [];
  for (const route of plan.routes || []) {
    const recipientId = clean(route.recipientId);
    const endpointId = clean(route.endpointId);
    const channel = clean(route.channel).toUpperCase();
    const pair = `${recipientId}::${endpointId}`;
    if (!recipientId || !endpointId) continue;
    if (seenRecipients.has(recipientId) || seenEndpointPairs.has(pair)) { duplicateRoutes.push({ recipientId, endpointId, channel }); continue; }
    seenRecipients.add(recipientId); seenEndpointPairs.add(pair);
    routes.push({ recipientId, endpointId, channel, opportunityId: clean(route.opportunityId) || null });
  }
  const byChannel = {};
  for (const route of routes) byChannel[route.channel] = (byChannel[route.channel] || 0) + 1;
  const emailReach = byChannel.EMAIL || 0;
  const nonEmailReach = routes.length - emailReach;
  const uniqueReachableRecipients = routes.length;
  const remainingToTarget = Math.max(0, targetCount - uniqueReachableRecipients);
  const smtpReady = smtpCertificate?.state === 'CERTIFIED_100K_READY' && smtpCertificate?.oneButton100kPressAvailable === true;
  const state = uniqueReachableRecipients >= targetCount ? 'ECONOMIC_REACH_TARGET_READY' : uniqueReachableRecipients > 0 ? 'PARTIAL_ECONOMIC_REACH' : 'NO_LEGITIMATE_REACH';
  const seed = { state, target: targetCount, uniqueReachableRecipients, remainingToTarget, byChannel, smtpReady, smtpEquivalent: false };
  return {
    ...seed,
    substitutionId: `uberreach_sub_${sha256(seed)}`,
    routes,
    duplicateRoutes,
    unreachable: plan.unreachable || [],
    substitution: { emailReach, nonEmailReach, canReduceSmtpDependence: nonEmailReach > 0, replacesSmtpCertificate: false },
    automaticContactAuthority: false,
    automaticSendAuthority: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'This compiler substitutes the objective from 100,000 SMTP sends to 100,000 unique recipients with fresh, public-or-authorized, terms-compatible reachable endpoints. It does not bypass provider limits, suppression, recipient authorization, platform rules, or the SMTP certificate; it does not contact anyone. Each consequential contact still requires current authority and its channel-specific gate.'
  };
}
