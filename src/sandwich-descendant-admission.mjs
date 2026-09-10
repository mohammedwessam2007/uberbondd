import { canonicalConceptId, slugify } from './sovereign-coverage-matrix.mjs';

export const SANDWICH_DESCENDANT_ADMISSION_VERSION = 'uberbond.sandwich-descendant-admission.v1';
export const SANDWICH_DESCENDANT_CANON_PATH = 'artifacts/sovereign-cognitive-continuum-total-north-star.json';
const SHA40 = /^[a-f0-9]{40}$/i;
const FOLD_CLASSES = new Set(['INTERNAL_SOURCE', 'INTERNAL_RESEARCH']);
const ZERO = Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const text = (value, max = 1000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const uniq = values => [...new Set((Array.isArray(values) ? values : []).map(value => String(value).trim()).filter(Boolean))];
const conceptName = value => typeof value === 'string' ? value.trim() : (value && typeof value === 'object' ? String(value.name || '').trim() : '');
const fail = reasonCodes => ({ok:false,status:'SANDWICH_DESCENDANT_ADMISSION_REFUSED',version:SANDWICH_DESCENDANT_ADMISSION_VERSION,reasonCodes:uniq(reasonCodes),businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO}});

function canonicalReferenceNames(doc) {
  const keys = ['terminalConcepts','containedPersonalCivilizationSystems','supportingEconomicAndTechnicalDonors','terminalTriad','canonicalHierarchy'];
  const names = new Set();
  for (const key of keys) for (const entry of Array.isArray(doc?.[key]) ? doc[key] : []) {
    const name = conceptName(entry);
    if (name) names.add(name);
  }
  return names;
}

export function compileSandwichDescendantAdmission({beforeDocument, candidate, baseRevision} = {}) {
  const base = text(baseRevision, 80)?.toLowerCase();
  const reasons = [];
  if (!beforeDocument || typeof beforeDocument !== 'object' || Array.isArray(beforeDocument)) reasons.push('canonical-before-document-required');
  if (!SHA40.test(base || '')) reasons.push('exact-base-revision-required');
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) reasons.push('structured-descendant-requirement-required');
  if (reasons.length) return fail(reasons);

  const terminalConcepts = Array.isArray(beforeDocument.terminalConcepts) ? beforeDocument.terminalConcepts : null;
  if (!terminalConcepts) reasons.push('terminal-concepts-array-required');
  const name = text(candidate.name, 180);
  const foldClass = text(candidate.foldClass, 40);
  const rationale = text(candidate.rationale, 1200);
  const goalRefs = uniq(candidate.canonicalGoalRefs);
  const acceptance = uniq(candidate.acceptanceEvidence);
  if (!name) reasons.push('bounded-requirement-name-required');
  if (!FOLD_CLASSES.has(foldClass)) reasons.push('internal-fold-class-required');
  if (!rationale) reasons.push('bounded-causal-rationale-required');
  if (goalRefs.length < 1 || goalRefs.length > 8) reasons.push('one-to-eight-canonical-goal-refs-required');
  if (acceptance.length < 2 || acceptance.length > 8) reasons.push('two-to-eight-acceptance-evidence-clauses-required');
  if (!acceptance.some(value => /^SOURCE:/i.test(value))) reasons.push('source-acceptance-clause-required');
  if (!acceptance.some(value => /^TEST:/i.test(value))) reasons.push('test-acceptance-clause-required');
  if (acceptance.some(value => value.length > 500)) reasons.push('acceptance-clause-too-long');

  const existingNames = new Set((terminalConcepts || []).map(conceptName).filter(Boolean));
  if (name && existingNames.has(name)) reasons.push('descendant-requirement-name-already-canonical');
  if (name && [...existingNames].some(existing => slugify(existing) === slugify(name))) reasons.push('descendant-requirement-semantic-slug-collides');
  const canonicalRefs = canonicalReferenceNames(beforeDocument);
  for (const ref of goalRefs) if (!canonicalRefs.has(ref)) reasons.push(`noncanonical-goal-ref:${ref.slice(0,120)}`);
  if (Array.isArray(candidate.dependencies) && candidate.dependencies.length) reasons.push('descendant-genesis-must-select-dependency-satisfied-gap');
  if (reasons.length) return fail(reasons);

  const entry = {
    name,
    kind:'SANDWICH_DESCENDANT_REQUIREMENT',
    foldClass,
    admittedFromBaseRevision:base,
    canonicalGoalRefs:goalRefs,
    dependencies:[],
    acceptanceEvidence:acceptance,
    rationale,
    implementationStatus:'MISSING',
    terminalEvidenceClass:'IMPLEMENTATION_PLUS_INDEPENDENT_VERIFICATION',
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    implementationForbiddenInAdmission:true
  };
  const afterDocument = structuredClone(beforeDocument);
  afterDocument.terminalConcepts = [...terminalConcepts, entry];
  return {
    ok:true,
    status:'ONE_DESCENDANT_REQUIREMENT_ADMITTED_TO_CANON_CANDIDATE',
    version:SANDWICH_DESCENDANT_ADMISSION_VERSION,
    baseRevision:base,
    canonicalPath:SANDWICH_DESCENDANT_CANON_PATH,
    canonicalId:canonicalConceptId('total-north-star', name),
    entry,
    afterDocument,
    appendedCount:1,
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    externalEffectLedger:{...ZERO},
    truthBoundary:'This compiles one append-only internal requirement candidate into the existing canonical denominator. It does not implement, verify, promote, merge, deploy, grant authority, or prove an external outcome.'
  };
}
