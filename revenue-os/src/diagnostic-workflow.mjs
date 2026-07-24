// Diagnostic project state machine (workstream 10, mission's own exact sequence) plus the delivery
// gate. 18 linear states plus 4 exception states (CANCELED, REFUNDED, DISPUTED, BLOCKED) reachable
// from most non-terminal points -- a real diagnostic engagement can be canceled, refunded,
// disputed, or blocked at almost any stage, and the state machine models that explicitly rather
// than pretending the linear happy path is the only path.
import { findUnsupportedClaims } from './claims.mjs';

export const DIAGNOSTIC_STATES = Object.freeze([
  'DRAFT', 'DEMO_PROPOSED', 'PAYMENT_REQUESTED', 'PAID', 'ONBOARDING', 'WAITING_FOR_INPUTS',
  'SCOPE_ACCEPTED', 'CHECKS_RUNNING', 'EVIDENCE_REVIEW', 'REPORT_DRAFTED', 'QA', 'READY_TO_DELIVER',
  'DELIVERED', 'CORRECTION', 'ACCEPTED', 'IMPLEMENTATION_OFFERED', 'MONITORING_OFFERED', 'CLOSED'
]);
export const EXCEPTION_STATES = Object.freeze(['CANCELED', 'REFUNDED', 'DISPUTED', 'BLOCKED']);
export const ALL_STATES = Object.freeze([...DIAGNOSTIC_STATES, ...EXCEPTION_STATES]);

const LINEAR_NEXT = Object.freeze({
  DRAFT: 'DEMO_PROPOSED', DEMO_PROPOSED: 'PAYMENT_REQUESTED', PAYMENT_REQUESTED: 'PAID',
  PAID: 'ONBOARDING', ONBOARDING: 'WAITING_FOR_INPUTS', WAITING_FOR_INPUTS: 'SCOPE_ACCEPTED',
  SCOPE_ACCEPTED: 'CHECKS_RUNNING', CHECKS_RUNNING: 'EVIDENCE_REVIEW', EVIDENCE_REVIEW: 'REPORT_DRAFTED',
  REPORT_DRAFTED: 'QA', QA: 'READY_TO_DELIVER', READY_TO_DELIVER: 'DELIVERED',
  DELIVERED: 'ACCEPTED', ACCEPTED: 'IMPLEMENTATION_OFFERED', IMPLEMENTATION_OFFERED: 'MONITORING_OFFERED',
  MONITORING_OFFERED: 'CLOSED'
});

// DELIVERED can also loop back through CORRECTION (a defect was found post-delivery) and CORRECTION
// resumes at either REPORT_DRAFTED (a full re-draft) or READY_TO_DELIVER (a small fix, re-deliver
// as-is) -- both are legitimate outcomes of a correction cycle.
const EXTRA_FORWARD_EDGES = Object.freeze({ DELIVERED: ['CORRECTION'], CORRECTION: ['REPORT_DRAFTED', 'READY_TO_DELIVER'] });

// A state a project is already in that is terminal for exception purposes -- no further exception
// transition makes sense once here.
const TERMINAL_STATES = Object.freeze(['CLOSED', 'CANCELED', 'REFUNDED', 'DISPUTED', 'BLOCKED']);

export class DiagnosticWorkflowError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'DiagnosticWorkflowError';
    this.code = code;
  }
}

export function assertValidTransition(fromStatus, toStatus) {
  if (!ALL_STATES.includes(fromStatus)) throw new DiagnosticWorkflowError('unknown-status', fromStatus);
  if (!ALL_STATES.includes(toStatus)) throw new DiagnosticWorkflowError('unknown-status', toStatus);
  if (LINEAR_NEXT[fromStatus] === toStatus) return true;
  if ((EXTRA_FORWARD_EDGES[fromStatus] || []).includes(toStatus)) return true;
  if (EXCEPTION_STATES.includes(toStatus) && !TERMINAL_STATES.includes(fromStatus)) return true;
  throw new DiagnosticWorkflowError('invalid-transition', `cannot go from ${fromStatus} to ${toStatus}`);
}

/**
 * The mission's 6-condition delivery gate (same shape this session has used before, applied to
 * this larger model): blocks the READY_TO_DELIVER -> DELIVERED transition on payment, scope,
 * evidence lineage, unsupported claims, branding, and QA -- every blocker returned, not just the
 * first.
 */
export function deliveryGate({ project, payment, scopeAcceptance, evidenceItems = [], defectCards = [], report, qaResult, brand }) {
  const blockers = [];
  if (!payment || payment.status !== 'VERIFIED') blockers.push({ code: 'payment-not-verified', detail: payment?.status || 'missing' });
  if (!scopeAcceptance || scopeAcceptance.accepted !== true) blockers.push({ code: 'scope-not-accepted' });
  const missingLineage = evidenceItems.filter(item => !item.data?.lineage && !item.lineage);
  if (evidenceItems.length === 0 || missingLineage.length > 0) blockers.push({ code: 'evidence-lacks-source-lineage', detail: evidenceItems.length === 0 ? 'no evidence' : `${missingLineage.length} item(s) missing lineage` });
  const ungrounded = defectCards.filter(card => !Array.isArray(card.evidenceRefs) || card.evidenceRefs.length === 0);
  const unsupported = defectCards.filter(card => findUnsupportedClaims(card.cautiousConsequence || '').length > 0 || findUnsupportedClaims(card.recommendation || '').length > 0);
  if (ungrounded.length > 0 || unsupported.length > 0) blockers.push({ code: 'unsupported-claim', detail: `${ungrounded.length} ungrounded, ${unsupported.length} guarantee-shaped` });
  if (!brand || !brand.agencyDisplayName || !brand.primaryColor || !brand.contactEmail) blockers.push({ code: 'agency-branding-incomplete' });
  if (!qaResult || qaResult.passed !== true) blockers.push({ code: 'qa-failed', detail: qaResult ? `${qaResult.failedItems?.length || 0} item(s) failed` : 'QA not run' });
  if (!report) blockers.push({ code: 'report-not-drafted' });
  return { blocked: blockers.length > 0, blockers };
}
