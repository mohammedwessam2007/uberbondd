// Service registry repair (24/7 Continuous Revenue Core, section 3). Validates that every offer in
// config.mjs#SERVICE_CATALOG carries meaningful, non-blank required text and array fields --
// "meaningful" meaning non-empty *after normalization* (whitespace-only counts as blank), so a
// service definition with `publicName: '   '` is rejected exactly like one with `publicName: ''`.
// This is a structural gate, not a lint suggestion: config.mjs calls assertValidServiceDefinition
// on every catalog entry at module load, so a malformed service definition fails the moment the
// module is imported, not the first time a caller happens to read the blank field.
export class ServiceRegistryError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ServiceRegistryError';
    this.code = code;
  }
}

export const REQUIRED_TEXT_FIELDS = Object.freeze(['publicName', 'scope', 'customerDefinition']);
export const REQUIRED_ARRAY_FIELDS = Object.freeze(['disclaimers', 'checklistItems', 'evidenceRequirements', 'approvals', 'deliverables']);

function normalizeText(value) {
  return String(value ?? '').trim();
}

/** Returns {valid, problems} -- never throws, so a caller building an owner-facing "what's wrong
 * with this offer" report can collect every problem rather than catching one exception at a time. */
export function validateServiceDefinition(service) {
  const problems = [];
  if (!service || typeof service !== 'object') return { valid: false, problems: ['not-an-object'] };
  if (!normalizeText(service.key)) problems.push('blank-key');

  for (const field of REQUIRED_TEXT_FIELDS) {
    if (!normalizeText(service[field])) problems.push(`blank-${field}`);
  }
  for (const field of REQUIRED_ARRAY_FIELDS) {
    const arr = service[field];
    if (!Array.isArray(arr) || arr.length === 0) problems.push(`missing-${field}`);
    else if (arr.some(item => !normalizeText(item))) problems.push(`blank-entry-in-${field}`);
  }

  const hasFixedPrice = Number.isInteger(service.priceCents) && service.priceCents > 0;
  const hasRangedPrice = Number.isInteger(service.priceCentsMin) && Number.isInteger(service.priceCentsMax) && service.priceCentsMin > 0 && service.priceCentsMax >= service.priceCentsMin;
  if (!hasFixedPrice && !hasRangedPrice) problems.push('missing-or-invalid-price');

  // Section 3's own explicit instruction: "Do not claim these prices are market-validated." A
  // service with pricing but no disclaimer saying so is not actually meeting the requirement, even
  // if every other field is present -- checked here, not left to reviewer memory.
  const disclaimers = Array.isArray(service.disclaimers) ? service.disclaimers.map(normalizeText) : [];
  if ((hasFixedPrice || hasRangedPrice) && !disclaimers.some(d => /not (?:independently )?market[- ]validated/i.test(d))) {
    problems.push('missing-market-validation-disclaimer');
  }

  return { valid: problems.length === 0, problems };
}

export function assertValidServiceDefinition(service) {
  const result = validateServiceDefinition(service);
  if (!result.valid) throw new ServiceRegistryError('invalid-service-definition', `${service?.key || '(unknown key)'}: ${result.problems.join(', ')}`);
  return service;
}

/** Validates every entry in a catalog object (config.mjs#SERVICE_CATALOG's shape: {KEY: service}).
 * Throws on the first invalid entry with every problem for that entry (not just the first) --
 * matches this repository's own "report everything wrong with one bad input, don't stop at the
 * first reason" convention used throughout importer.mjs and channel-safety.mjs. */
export function assertValidServiceCatalog(catalog) {
  for (const [key, service] of Object.entries(catalog || {})) {
    const result = validateServiceDefinition(service);
    if (!result.valid) throw new ServiceRegistryError('invalid-service-catalog', `catalog entry "${key}": ${result.problems.join(', ')}`);
  }
  return catalog;
}
