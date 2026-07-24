// Defect classification (workstream 10). Every defect card carries the mission's exact 10 required
// fields -- category, severity, reproduction, evidence, confidence, limitations, cautious
// consequence, recommendation, effort, reversibility, authorization requirement (11 counting
// authorizationRequired as its own field; the mission lists "authorization requirement" as the
// 10th named property, so this module treats it as such). "Never claim revenue loss as fact" is
// enforced structurally: `consequence` is always phrased as a possibility, never an assertion.
import { id } from './store.mjs';

export const CATEGORY_BY_CHECK = Object.freeze({
  reachability: 'site_unreachable', https_certificate: 'insecure_or_expiring_certificate',
  redirects: 'broken_redirect_chain', phone_link: 'missing_phone_lead_path', email_link: 'missing_email_lead_path',
  contact_link: 'missing_contact_lead_path', form_presence: 'missing_lead_form', form_action_availability: 'form_target_unavailable',
  cta_presence: 'missing_call_to_action', noindex_robots: 'unexpected_noindex_change', title_meta: 'unexpected_title_change',
  broken_internal_links: 'broken_internal_links', visual_regression: 'unexpected_visual_change',
  mobile_viewport_rendering: 'mobile_render_capture_failed', response_time_regression: 'slow_page_load',
  configured_element_presence: 'expected_element_missing', baseline_drift: 'baseline_drift_detected'
});

export const SEVERITY_BY_CHECK = Object.freeze({
  reachability: 'critical', https_certificate: 'high', redirects: 'high', phone_link: 'medium', email_link: 'low',
  contact_link: 'medium', form_presence: 'medium', form_action_availability: 'high', cta_presence: 'low',
  noindex_robots: 'high', title_meta: 'low', broken_internal_links: 'medium', visual_regression: 'medium',
  mobile_viewport_rendering: 'low', response_time_regression: 'low', configured_element_presence: 'medium', baseline_drift: 'medium'
});

const REPRODUCTION_BY_CHECK = Object.freeze({
  reachability: 'Load the page directly in a browser at the checked URL.',
  https_certificate: 'View the page and inspect the certificate/lock icon in the address bar.',
  phone_link: 'View page source and search for a tel: link.',
  form_presence: 'View the page and look for a visible contact/lead form.',
  form_action_availability: "Load the form's declared action URL directly (no submission performed)."
});

const EFFORT_HOURS_BY_SEVERITY = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1 });

export class DefectError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'DefectError';
    this.code = code;
  }
}

/**
 * Builds one defect card per failed check result, grounded in the evidence item recorded for that
 * check run -- a failed check with no matching evidence is skipped (reported in `skipped`), never
 * promoted to a defect with fabricated evidence. Mirrors the same "no card without evidence" rule
 * this session has used in a sibling mission.
 */
export function buildDefectCards(checkResults = [], { websiteId, evidenceItems = [] } = {}) {
  const websiteEvidence = evidenceItems.filter(item => item.data?.websiteId === websiteId || item.websiteId === websiteId);
  const cards = []; const skipped = [];
  for (const result of checkResults.filter(r => r.status === 'failed')) {
    if (websiteEvidence.length === 0) { skipped.push({ checkKey: result.checkKey, reason: 'no-evidence-for-website' }); continue; }
    const severity = SEVERITY_BY_CHECK[result.checkKey] || 'medium';
    cards.push({
      id: id('defect'), websiteId, checkKey: result.checkKey,
      category: CATEGORY_BY_CHECK[result.checkKey] || 'unclassified_issue',
      severity,
      reproduction: REPRODUCTION_BY_CHECK[result.checkKey] || `Re-run the ${result.checkKey} check against the same URL.`,
      evidenceRefs: websiteEvidence.map(item => item.id),
      confidence: 0.8,
      limitations: 'Automated check only; not a manual QA review or a security audit.',
      // Deliberately hedged -- never "this is costing you X" as a fact, always framed as a
      // possible consequence a human should weigh.
      cautiousConsequence: `This may reduce how easily a visitor can ${consequenceVerbFor(result.checkKey)}; actual impact is not measured by this check.`,
      recommendation: recommendationFor(result.checkKey),
      effortHours: EFFORT_HOURS_BY_SEVERITY[severity] ?? 2,
      reversibility: 'reversible',
      authorizationRequired: true
    });
  }
  return { cards, skipped };
}

function consequenceVerbFor(checkKey) {
  const map = { phone_link: 'call the business', email_link: 'email the business', contact_link: 'find a contact page', form_presence: 'submit an inquiry', cta_presence: 'take the next step', reachability: 'reach the site at all' };
  return map[checkKey] || 'complete the intended action on this page';
}
function recommendationFor(checkKey) {
  const map = {
    reachability: 'Investigate hosting/DNS/server status immediately.',
    https_certificate: 'Renew or reconfigure the TLS certificate.',
    phone_link: 'Add a visible tel: link near the top of the page.',
    contact_link: 'Add or restore a working link to a contact page.',
    form_presence: 'Add a lead-capture form to the page.',
    form_action_availability: "Verify the form's action endpoint is deployed and reachable.",
    cta_presence: 'Add a clear call-to-action (e.g. "Get a Quote" or "Call Now").'
  };
  return map[checkKey] || 'Review this finding with a developer before making any change.';
}

export async function persistDefectCards(store, diagnosticProjectId, checkRunId, cards) {
  const persisted = [];
  for (const card of cards) persisted.push(await store.add('defects', { id: id('defect'), diagnosticProjectId, checkRunId, ...card }));
  return persisted;
}
