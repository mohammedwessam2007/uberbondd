// Reserved domains (RFC 2606 / RFC 6761).
//
// Recovered from the pre-rewrite lineage during CD012 archaeology. Main had no
// equivalent: `registerSendingDomain` accepted `example.test` as an
// OWNER_CONFIRMED outreach sending domain, and that path is reachable from two
// production job handlers. A synthetic fixture domain becoming a real send
// target is the failure this prevents.
//
// RFC 2606 reserves example.com/.net/.org and the .example/.test/.invalid TLDs
// for documentation and testing; RFC 6761 adds .localhost. None of them can be
// owned, so none can ever be a legitimate sending domain outside a simulation.
//
// This is the one place the decision is made, so every import, validation,
// reservation and dispatch path shares it rather than re-deriving a partial
// check of its own.
import { normalizeDomain } from './utils.mjs';

export const RESERVED_DOMAINS_VERSION = 'uberbond.reserved-domains.v1';

const RESERVED_SUFFIXES = Object.freeze(['.example', '.test', '.invalid', '.localhost']);
const RESERVED_EXACT = Object.freeze(['example.com', 'example.net', 'example.org', 'example.edu']);

export function isReservedDomain(domain = '') {
  const value = normalizeDomain(domain);
  if (!value) return false;
  // A subdomain of a reserved name is just as unownable as the name itself.
  // The recovered original matched only the bare second-level name, so
  // `mail.example.org` passed straight through it.
  if (RESERVED_EXACT.some(name => value === name || value.endsWith(`.${name}`))) return true;
  // `value === suffix.slice(1)` catches the bare TLD ("test"), `endsWith` the
  // subdomains under it ("mail.test"). A domain merely containing the word,
  // such as "attestation.com", is not reserved.
  return RESERVED_SUFFIXES.some(suffix => value === suffix.slice(1) || value.endsWith(suffix));
}

/**
 * Fails closed. A reserved domain is accepted only when the caller explicitly
 * declares `simulation: true` -- never by a truthy value, an env var, or a
 * default, because every one of those is a way for a fixture to become real
 * without anyone deciding that it should.
 */
export function assertNotReservedOutsideSimulation(domain, { simulation = false } = {}) {
  if (!isReservedDomain(domain)) return { ok: true };
  if (simulation === true) return { ok: true, simulationOnly: true };
  return { ok: false, reason: 'reserved-domain-outside-simulation' };
}
