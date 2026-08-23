// Deciding to page someone and actually reaching them are different problems.
//
// The escalation kernel solved the first and reported the second as the string
// `transport: 'UNCONFIGURED'` -- a literal in a report, with no transport
// concept behind it. Nothing could be configured, nothing could be attempted,
// and a delivery that failed was indistinguishable from one that was never
// tried. "The system knows it is in trouble" and "somebody was told" were the
// same field.
//
// This module is the transport half. It deliberately ships no transport that
// reaches a human device: every such transport requires owner authorization
// this system does not hold, and inventing one would make the report lie in the
// more dangerous direction. What it does is make the gap addressable, provable,
// and loud:
//
//   - a transport is a declared thing with a kind and an honest `reachesHuman`
//   - an attempt produces a durable receipt, per transport
//   - "not configured", "tried and failed", and "tried and cannot tell" are
//     three different outcomes, because they call for three different responses
//   - an escalation with no human-reachable delivery is itself a fact the
//     system must escalate, rather than a quiet field nobody reads
//
// The last point is the one that matters. A monitoring system that detects a
// critical condition and cannot tell anyone has two problems, and the second is
// worse than the first.

import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OPERATOR_ESCALATION_TRANSPORT_POLICY_VERSION = 'operator-escalation-transport-1.0.0';

export const PAGE_AUDIT_TYPE = 'operator_page_attempt';

/**
 * Outcomes of one delivery attempt.
 *
 * UNCONFIGURED and DELIVERY_UNKNOWN are not variations on failure. The first
 * says nobody tried; the second says something was set in motion and its result
 * is not knowable. Collapsing them is how an operator comes to believe a page
 * was never sent when it may already have arrived.
 */
export const TRANSPORT_OUTCOMES = Object.freeze({
  UNCONFIGURED: 'UNCONFIGURED',
  DELIVERED: 'DELIVERED',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  DELIVERY_UNKNOWN: 'DELIVERY_UNKNOWN',
  REFUSED_UNAUTHORIZED: 'REFUSED_UNAUTHORIZED'
});

export const TRANSPORT_KINDS = Object.freeze({
  /** Writes to this system's own durable store. Provable, and reaches nobody. */
  DURABLE_AUDIT: 'DURABLE_AUDIT',
  /** Writes to a location an operator has arranged to watch. Still not a device. */
  OPERATOR_SINK: 'OPERATOR_SINK',
  /** Push, SMS, email, phone. Requires owner authorization this system does not hold. */
  HUMAN_DEVICE: 'HUMAN_DEVICE'
});

/** Delivery proof for the escalation as a whole. */
export const DELIVERY_PROOF = Object.freeze({
  HUMAN_DELIVERY_PROVEN: 'HUMAN_DELIVERY_PROVEN',
  DURABLE_RECORD_ONLY: 'DURABLE_RECORD_ONLY',
  NO_TRANSPORT_CONFIGURED: 'NO_TRANSPORT_CONFIGURED',
  DELIVERY_INDETERMINATE: 'DELIVERY_INDETERMINATE'
});

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function parseDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/**
 * Validate one transport declaration.
 *
 * A HUMAN_DEVICE transport without an owner authorization reference is refused
 * outright rather than registered-and-skipped. A transport that can wake a
 * person at 3am is not something to leave half-configured and discover later.
 */
export function compileOperatorTransport(raw = {}) {
  const id = text(raw.id, 80);
  const kind = text(raw.kind, 40).toUpperCase();
  if (!id) return { ok: false, reasonCodes: ['transport-id-required'] };
  if (!Object.hasOwn(TRANSPORT_KINDS, kind)) return { ok: false, reasonCodes: ['unknown-transport-kind'] };
  if (typeof raw.deliver !== 'function') return { ok: false, reasonCodes: ['transport-deliver-required'] };

  const ownerAuthorizationRef = text(raw.ownerAuthorizationRef, 200);
  if (kind === TRANSPORT_KINDS.HUMAN_DEVICE && !ownerAuthorizationRef) {
    return { ok: false, reasonCodes: ['human-device-transport-requires-owner-authorization'] };
  }

  return {
    ok: true,
    transport: Object.freeze({
      id,
      kind,
      // Only a transport that reaches a device the owner carries may claim it,
      // and claiming it is not the same as it being true -- which is why the
      // kind, not the flag, is what the delivery proof is computed from.
      reachesHuman: kind === TRANSPORT_KINDS.HUMAN_DEVICE,
      ownerAuthorizationRef: ownerAuthorizationRef || null,
      deliver: raw.deliver
    })
  };
}

/**
 * The always-available transport: write the page into this system's own audit
 * log. Its delivery proof is a row id. It reaches nobody, and says so.
 */
export function durableAuditTransport(store) {
  return compileOperatorTransport({
    id: 'durable-audit',
    kind: TRANSPORT_KINDS.DURABLE_AUDIT,
    deliver: async page => {
      if (!store || typeof store.log !== 'function') {
        return { delivered: false, reasonCodes: ['store-log-required'] };
      }
      const row = await store.log('operator_page_durable_record', page);
      return { delivered: true, deliveryRef: row?.id ? `audit:${row.id}` : null };
    }
  });
}

function pageFingerprint(escalation, date) {
  return crypto.createHash('sha256')
    .update(JSON.stringify({
      escalationId: text(escalation?.escalationId, 120),
      fingerprint: text(escalation?.fingerprint, 200),
      day: parseDate(date).toISOString().slice(0, 10)
    }))
    .digest('hex')
    .slice(0, 24);
}

async function attemptOne(transport, page) {
  try {
    const result = await transport.deliver(page);
    if (result && result.delivered === true) {
      return {
        outcome: TRANSPORT_OUTCOMES.DELIVERED,
        deliveryRef: text(result.deliveryRef, 200) || null,
        reasonCodes: []
      };
    }
    if (result && result.indeterminate === true) {
      return { outcome: TRANSPORT_OUTCOMES.DELIVERY_UNKNOWN, deliveryRef: null, reasonCodes: ['transport-reported-indeterminate'] };
    }
    return {
      outcome: TRANSPORT_OUTCOMES.DELIVERY_FAILED,
      deliveryRef: null,
      reasonCodes: Array.isArray(result?.reasonCodes) ? result.reasonCodes.map(code => text(code, 80)) : ['transport-reported-failure']
    };
  } catch (error) {
    // A transport that threw may or may not have delivered. Recording this as a
    // failure would let an operator conclude "not sent" about a page that is
    // already on a phone; recording it as delivered is worse. It is unknown.
    return {
      outcome: TRANSPORT_OUTCOMES.DELIVERY_UNKNOWN,
      deliveryRef: null,
      reasonCodes: ['transport-threw', text(error?.message, 200)].filter(Boolean)
    };
  }
}

function proofFrom(attempts) {
  if (!attempts.length) return DELIVERY_PROOF.NO_TRANSPORT_CONFIGURED;
  if (attempts.some(a => a.reachesHuman && a.outcome === TRANSPORT_OUTCOMES.DELIVERED)) {
    return DELIVERY_PROOF.HUMAN_DELIVERY_PROVEN;
  }
  // An unknown result on a human-reachable transport outranks a durable record:
  // the page may be delivered, and reporting DURABLE_RECORD_ONLY would state
  // that it is not.
  if (attempts.some(a => a.reachesHuman && a.outcome === TRANSPORT_OUTCOMES.DELIVERY_UNKNOWN)) {
    return DELIVERY_PROOF.DELIVERY_INDETERMINATE;
  }
  if (attempts.some(a => a.outcome === TRANSPORT_OUTCOMES.DELIVERED)) {
    return DELIVERY_PROOF.DURABLE_RECORD_ONLY;
  }
  if (attempts.some(a => a.outcome === TRANSPORT_OUTCOMES.DELIVERY_UNKNOWN)) {
    return DELIVERY_PROOF.DELIVERY_INDETERMINATE;
  }
  return DELIVERY_PROOF.NO_TRANSPORT_CONFIGURED;
}

/**
 * Attempt one escalation across every configured transport, and write down what
 * happened on each.
 *
 * Every transport is attempted, including after one succeeds. A page is not a
 * job to be done once; the point of several transports is that each is evidence
 * about a different failure mode, and stopping at the first success discards
 * the evidence that the others are broken.
 */
export async function dispatchOperatorPage(store, { escalation, transports = [], date = new Date() } = {}) {
  const now = parseDate(date);
  if (!escalation || typeof escalation !== 'object') {
    return { ok: false, policyVersion: OPERATOR_ESCALATION_TRANSPORT_POLICY_VERSION, reasonCodes: ['escalation-required'] };
  }

  const page = {
    policyVersion: OPERATOR_ESCALATION_TRANSPORT_POLICY_VERSION,
    pageId: `page_${pageFingerprint(escalation, now)}`,
    escalationId: text(escalation.escalationId, 120),
    fingerprint: text(escalation.fingerprint, 200),
    severity: text(escalation.severity, 20),
    type: text(escalation.type, 100),
    recommendedAction: text(escalation.recommendedAction, 400),
    createdAt: now.toISOString()
  };

  const attempts = [];
  for (const candidate of transports) {
    const compiled = candidate?.ok === true && candidate.transport ? candidate : compileOperatorTransport(candidate);
    if (!compiled.ok) {
      attempts.push({
        transportId: text(candidate?.id, 80) || 'unknown',
        kind: text(candidate?.kind, 40).toUpperCase() || 'UNKNOWN',
        reachesHuman: false,
        outcome: TRANSPORT_OUTCOMES.REFUSED_UNAUTHORIZED,
        deliveryRef: null,
        reasonCodes: compiled.reasonCodes
      });
      continue;
    }
    const transport = compiled.transport;
    const result = await attemptOne(transport, page);
    attempts.push({
      transportId: transport.id,
      kind: transport.kind,
      reachesHuman: transport.reachesHuman,
      ...result
    });
  }

  const deliveryProof = proofFrom(attempts);
  const receipt = {
    ok: true,
    policyVersion: OPERATOR_ESCALATION_TRANSPORT_POLICY_VERSION,
    page,
    attempts,
    deliveryProof,
    // The whole reason this module exists: a critical condition nobody was told
    // about is a distinct, worse condition.
    ownerReached: deliveryProof === DELIVERY_PROOF.HUMAN_DELIVERY_PROVEN,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    dispatchedAt: now.toISOString()
  };

  if (store && typeof store.log === 'function') {
    const row = await store.log(PAGE_AUDIT_TYPE, {
      policyVersion: receipt.policyVersion,
      pageId: page.pageId,
      escalationId: page.escalationId,
      fingerprint: page.fingerprint,
      severity: page.severity,
      deliveryProof,
      ownerReached: receipt.ownerReached,
      attempts: attempts.map(({ transportId, kind, reachesHuman, outcome, deliveryRef, reasonCodes }) =>
        ({ transportId, kind, reachesHuman, outcome, deliveryRef, reasonCodes })),
      dispatchedAt: receipt.dispatchedAt
    });
    receipt.auditId = row?.id || null;
  }

  return receipt;
}
