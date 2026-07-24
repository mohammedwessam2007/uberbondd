// QA checklist for the diagnostic factory's QA state (workstream 10 -- a real 6-item checklist,
// not a rubber stamp, feeding deliveryGate's `qaResult` requirement).
import { findUnsupportedClaims } from './claims.mjs';

export const QA_CHECKLIST_ITEMS = Object.freeze([
  { key: 'all_websites_checked', label: 'Every configured website has at least one check run' },
  { key: 'every_defect_has_evidence', label: 'Every defect card cites at least one evidence item' },
  { key: 'no_unsupported_claims', label: 'No defect card or report text matches a guarantee-shaped claim pattern' },
  { key: 'branding_complete', label: 'Agency brand name, primary color, and contact email are all present' },
  { key: 'report_not_empty', label: 'The report has at least one defect or an explicit "no defects found" statement' },
  { key: 'manifest_signed', label: 'A signed manifest exists for the report' }
]);

export function runQaChecklist({ project, websitesChecked = [], websites = [], defectCards = [], report, manifest, brand }) {
  const results = QA_CHECKLIST_ITEMS.map(item => {
    let passed = false;
    switch (item.key) {
      case 'all_websites_checked': passed = websites.every(w => websitesChecked.includes(w.id)); break;
      case 'every_defect_has_evidence': passed = defectCards.every(c => Array.isArray(c.evidenceRefs) && c.evidenceRefs.length > 0); break;
      case 'no_unsupported_claims': passed = defectCards.every(c => findUnsupportedClaims(c.cautiousConsequence).length === 0 && findUnsupportedClaims(c.recommendation).length === 0); break;
      case 'branding_complete': passed = Boolean(brand?.agencyDisplayName && brand?.primaryColor && brand?.contactEmail); break;
      case 'report_not_empty': passed = defectCards.length > 0 || report?.executiveSummary?.noDefectsFound === true; break;
      case 'manifest_signed': passed = Boolean(manifest?.signature); break;
      default: passed = false;
    }
    return { ...item, passed };
  });
  const failedItems = results.filter(item => !item.passed).map(item => item.key);
  return { passed: failedItems.length === 0, checklist: results, failedItems };
}
