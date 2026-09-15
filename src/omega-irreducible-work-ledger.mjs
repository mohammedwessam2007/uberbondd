import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OMEGA_IRREDUCIBLE_WORK_LEDGER_VERSION = 'uberbond.omega-irreducible-work-ledger.v1';
const BOUND_CLASSES = new Set(['INFORMATION_QUERY', 'DECISION_TREE', 'COMMUNICATION', 'OUTPUT_SIZE', 'EXTERNAL_OBSERVATION', 'FORMAL_COMPLEXITY', 'PHYSICAL_RESOURCE']);
const envelope = extra => ({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra });
const fail = reasons => envelope({ ok: false, status: 'OMEGA_WORK_FLOOR_REFUSED', version: OMEGA_IRREDUCIBLE_WORK_LEDGER_VERSION, reasonCodes: [...new Set(reasons.filter(Boolean))] });
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value, max = 300) => { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; };
const number = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export function compileIrreducibleWorkFloor({ taskClass, observedWork, certifiedLowerBound, unit, boundClass, evidenceRefs = [] } = {}) {
  const task = text(taskClass, 500);
  const observed = number(observedWork);
  const lower = number(certifiedLowerBound);
  const normalizedUnit = text(unit, 120);
  const klass = String(boundClass || '');
  const evidence = Array.isArray(evidenceRefs) ? [...new Set(evidenceRefs.map(ref => text(ref, 500)).filter(Boolean))].sort() : [];
  const reasons = [];
  if (!task) reasons.push('task-class-required');
  if (observed == null || observed <= 0) reasons.push('positive-observed-work-required');
  if (lower == null) reasons.push('nonnegative-lower-bound-required');
  if (!normalizedUnit) reasons.push('unit-required');
  if (!BOUND_CLASSES.has(klass)) reasons.push('supported-bound-class-required');
  if (!evidence.length) reasons.push('lower-bound-evidence-required');
  if (observed != null && lower != null && lower > observed) reasons.push('lower-bound-exceeds-observed-work');
  if (reasons.length) return fail(reasons);
  const core = { taskClass: task, observedWork: observed, certifiedLowerBound: lower, unit: normalizedUnit, boundClass: klass, evidenceRefs: evidence };
  const excessAboveFloor = observed - lower;
  return envelope({
    ok: true,
    status: 'OMEGA_WORK_FLOOR_COMPILED',
    version: OMEGA_IRREDUCIBLE_WORK_LEDGER_VERSION,
    floor: {
      ...core,
      floorHash: digest(core),
      excessAboveFloor,
      maximumTheoreticalReductionFraction: observed > 0 ? excessAboveFloor / observed : 0,
      distanceToFloorRatio: lower > 0 ? observed / lower : null
    },
    truthBoundary: 'This ledger does not derive or validate the mathematical lower bound. It records an externally justified bound and prevents local optimization claims from crossing it without superseding evidence.'
  });
}

export function adjudicateWorkReductionClaim({ floor, claimedWork } = {}) {
  if (!floor?.floorHash) return fail(['compiled-floor-required']);
  const claimed = number(claimedWork);
  if (claimed == null) return fail(['nonnegative-claimed-work-required']);
  const belowCertifiedFloor = claimed < floor.certifiedLowerBound;
  const improvesObserved = claimed < floor.observedWork;
  return envelope({
    ok: true,
    status: belowCertifiedFloor ? 'OMEGA_WORK_CLAIM_CONTRADICTS_CERTIFIED_FLOOR' : 'OMEGA_WORK_CLAIM_WITHIN_CERTIFIED_FLOOR',
    version: OMEGA_IRREDUCIBLE_WORK_LEDGER_VERSION,
    admissibleUnderCurrentBound: !belowCertifiedFloor,
    improvesObserved,
    claimedWork: claimed,
    certifiedLowerBound: floor.certifiedLowerBound,
    evidenceRequiredToGoLower: belowCertifiedFloor ? 'SUPERSEDE_OR_INVALIDATE_CURRENT_LOWER_BOUND_WITH_STRONGER_EVIDENCE' : null,
    truthBoundary: 'A claim above the certified floor is merely not contradicted by this bound; it is not thereby proven achievable or correct.'
  });
}
