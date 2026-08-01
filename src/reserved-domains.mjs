// Premerge audit P1-013 (reserved domains). V3's seven-day simulation harness intentionally uses
// `*.example` domains as synthetic fixtures (RFC 2606 reserves example.com/.net/.org/.edu and the
// .example/.test/.invalid/.localhost TLDs for documentation and testing). That is correct for a
// simulation, but if provider/record typing is ever weak, a synthetic fixture domain could be
// committed as a real opportunity, prospect, or reservation outside simulation. This module is the
// one place that decision is made, so every import/validation/reservation/dispatch path can share
// it rather than re-deriving its own (possibly incomplete) domain-reservation check.
import { normalizeDomain } from './utils.mjs';

const RESERVED_SUFFIXES = Object.freeze(['.example', '.test', '.invalid', '.localhost']);
const RESERVED_EXACT = Object.freeze(['example.com', 'example.net', 'example.org', 'example.edu']);

export function isReservedDomain(domain = '') {
  const value = normalizeDomain(domain);
  if (!value) return false;
  if (RESERVED_EXACT.includes(value)) return true;
  return RESERVED_SUFFIXES.some(suffix => value === suffix.slice(1) || value.endsWith(suffix));
}

/** Fails closed: a reserved domain may only ever be accepted when `simulation` is explicitly true.
 * Returns { ok, reason } like the repo's other eligibility checks. */
export function assertNotReservedOutsideSimulation(domain, { simulation = false } = {}) {
  if (!isReservedDomain(domain)) return { ok: true };
  if (simulation === true) return { ok: true, simulationOnly: true };
  return { ok: false, reason: 'reserved-domain-outside-simulation' };
}
