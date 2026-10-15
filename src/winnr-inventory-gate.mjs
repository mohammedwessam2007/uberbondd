// Inventory gate for the Winnr Startup fleet. Pure functions only: no network, no filesystem, no environment reads.
//
// The expected inventory is supplied by the caller (in CI, from an environment secret). It is never committed to the
// repository, because domain names are business information and the repository is public. The mailbox roles are fixed
// in code, because they are part of the operating design, not configuration.
//
// Every gate returns reason codes from a closed vocabulary. A failing gate means no authentication request may be made.

export const WINNR_STARTUP_ROLES = Object.freeze(['hello', 'team', 'connect', 'partnerships', 'growth']);
export const WINNR_STARTUP_DOMAIN_COUNT = 10;
export const WINNR_STARTUP_MAILBOX_COUNT = 50;

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const lower = value => String(value ?? '').trim().toLowerCase();

function refuse(reasonCodes) {
  return Object.freeze({ ok: false, reasonCodes: [...new Set(reasonCodes)] });
}

// Parses and validates the expected inventory. Shape: {"startupDomains":[10 names],"pilotDomains":[1+ names]}.
export function parseExpectedInventory(text = '') {
  let parsed;
  try {
    parsed = JSON.parse(String(text || ''));
  } catch {
    return refuse(['inventory-not-json']);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return refuse(['inventory-shape-invalid']);
  if (!Array.isArray(parsed.startupDomains) || !Array.isArray(parsed.pilotDomains)) return refuse(['inventory-shape-invalid']);
  const startup = parsed.startupDomains.map(lower);
  const pilot = parsed.pilotDomains.map(lower);
  const reasons = [];
  if (startup.length !== WINNR_STARTUP_DOMAIN_COUNT) reasons.push('inventory-startup-domain-count-not-10');
  if (new Set(startup).size !== startup.length) reasons.push('inventory-startup-domain-duplicate');
  if (startup.some(d => !DOMAIN_RE.test(d))) reasons.push('inventory-startup-domain-invalid');
  if (pilot.length < 1) reasons.push('inventory-pilot-domain-required');
  if (new Set(pilot).size !== pilot.length) reasons.push('inventory-pilot-domain-duplicate');
  if (pilot.some(d => !DOMAIN_RE.test(d))) reasons.push('inventory-pilot-domain-invalid');
  if (pilot.some(d => startup.includes(d))) reasons.push('inventory-pilot-overlaps-startup');
  if (reasons.length) return refuse(reasons);
  return Object.freeze({ ok: true, reasonCodes: [], startupDomains: Object.freeze([...startup].sort()), pilotDomains: Object.freeze([...pilot].sort()) });
}

// Gate for the credential export rows. The export must hold exactly 50 distinct Startup addresses, across exactly the
// expected domains, with exactly the five expected roles on each domain. Anything else is refused.
export function gateCsvInventory({ expected, rows = [] } = {}) {
  if (!expected?.ok) return refuse(['expected-inventory-required']);
  const startup = new Set(expected.startupDomains);
  const pilot = new Set(expected.pilotDomains);
  const reasons = [];
  if (rows.length !== WINNR_STARTUP_MAILBOX_COUNT) reasons.push('mailbox-count-not-50');
  const seen = new Set();
  const rolesByDomain = new Map();
  let pilotRows = 0;
  let unexpectedDomainRows = 0;
  let unexpectedRoleRows = 0;
  for (const raw of rows) {
    const email = lower(raw.from_email ?? raw.email);
    if (!ADDRESS_RE.test(email)) { reasons.push('invalid-address'); continue; }
    const [local, domain] = email.split('@');
    if (seen.has(email)) reasons.push('duplicate-address');
    seen.add(email);
    if (lower(raw.domain) !== domain) reasons.push('domain-column-mismatch');
    if (lower(raw.user_name) !== email) reasons.push('username-not-address');
    if (pilot.has(domain)) { pilotRows += 1; continue; }
    if (!startup.has(domain)) { unexpectedDomainRows += 1; continue; }
    if (!WINNR_STARTUP_ROLES.includes(local)) { unexpectedRoleRows += 1; continue; }
    if (!rolesByDomain.has(domain)) rolesByDomain.set(domain, new Set());
    if (rolesByDomain.get(domain).has(local)) reasons.push('duplicate-role-on-domain');
    rolesByDomain.get(domain).add(local);
  }
  if (pilotRows > 0) reasons.push('pilot-domain-present');
  if (unexpectedDomainRows > 0) reasons.push('unexpected-domain');
  if (unexpectedRoleRows > 0) reasons.push('unexpected-role');
  for (const domain of startup) {
    const roles = rolesByDomain.get(domain);
    if (!roles || roles.size !== WINNR_STARTUP_ROLES.length) reasons.push('domain-role-set-incomplete');
  }
  if (rolesByDomain.size !== WINNR_STARTUP_DOMAIN_COUNT) reasons.push('domain-set-incomplete');
  if (reasons.length) return refuse(reasons);
  return Object.freeze({
    ok: true,
    reasonCodes: [],
    counts: Object.freeze({ mailboxes: rows.length, distinctAddresses: seen.size, domains: rolesByDomain.size, rolesPerDomain: WINNR_STARTUP_ROLES.length })
  });
}

// Gate for the provider's own inventory, read before any export. Startup = every provider domain that is not a pilot
// domain. The Startup domain set must equal the expected set exactly, and only expected roles may exist on those domains.
export function gateProviderInventory({ expected, providerDomains = [], providerMailboxes = [] } = {}) {
  if (!expected?.ok) return refuse(['expected-inventory-required']);
  const startup = new Set(expected.startupDomains);
  const pilot = new Set(expected.pilotDomains);
  const reasons = [];
  const providerNames = new Set(providerDomains.map(d => lower(d.name)));
  const startupProviderNames = [...providerNames].filter(n => !pilot.has(n));
  if (startupProviderNames.length !== WINNR_STARTUP_DOMAIN_COUNT || startupProviderNames.some(n => !startup.has(n))) {
    reasons.push('provider-startup-domain-set-mismatch');
  }
  for (const expectedDomain of startup) if (!providerNames.has(expectedDomain)) reasons.push('provider-startup-domain-missing');
  const seen = new Set();
  const rolesByDomain = new Map();
  let inactive = 0;
  for (const m of providerMailboxes) {
    const email = lower(m.full_address);
    const domain = lower(m.domain);
    if (!ADDRESS_RE.test(email)) { reasons.push('provider-invalid-address'); continue; }
    if (seen.has(email)) reasons.push('provider-duplicate-address');
    seen.add(email);
    const local = email.split('@')[0];
    if (pilot.has(domain)) continue;
    if (!startup.has(domain)) { reasons.push('provider-unexpected-domain'); continue; }
    if (!WINNR_STARTUP_ROLES.includes(local)) { reasons.push('provider-unexpected-role'); continue; }
    if (m.status !== 'active') inactive += 1;
    if (!rolesByDomain.has(domain)) rolesByDomain.set(domain, new Set());
    if (rolesByDomain.get(domain).has(local)) reasons.push('provider-duplicate-role-on-domain');
    rolesByDomain.get(domain).add(local);
  }
  const startupMailboxes = [...rolesByDomain.values()].reduce((sum, s) => sum + s.size, 0);
  if (startupMailboxes !== WINNR_STARTUP_MAILBOX_COUNT) reasons.push('provider-startup-mailbox-count-not-50');
  for (const domain of startup) {
    const roles = rolesByDomain.get(domain);
    if (!roles || roles.size !== WINNR_STARTUP_ROLES.length) reasons.push('provider-domain-role-set-incomplete');
  }
  if (inactive > 0) reasons.push('provider-mailbox-not-active');
  if (reasons.length) return refuse(reasons);
  return Object.freeze({ ok: true, reasonCodes: [], counts: Object.freeze({ startupDomains: startup.size, startupMailboxes, activeStartupMailboxes: startupMailboxes }) });
}

// The export must contain exactly the Startup addresses the provider reports, and nothing else.
export function gateCsvAgainstProvider({ rows = [], providerMailboxes = [], expected } = {}) {
  if (!expected?.ok) return refuse(['expected-inventory-required']);
  const pilot = new Set(expected.pilotDomains);
  const providerStartup = new Set(providerMailboxes.map(m => lower(m.full_address)).filter(a => ADDRESS_RE.test(a) && !pilot.has(a.split('@')[1])));
  const csvSet = new Set(rows.map(r => lower(r.from_email ?? r.email)));
  if (csvSet.size !== providerStartup.size) return refuse(['csv-provider-count-mismatch']);
  for (const a of csvSet) if (!providerStartup.has(a)) return refuse(['csv-address-not-in-provider']);
  return Object.freeze({ ok: true, reasonCodes: [] });
}
