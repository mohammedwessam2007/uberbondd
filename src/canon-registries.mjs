// Canon/V3 integration -- "Import the commercial offer, experiment, gate, message, attribution,
// and revalidation registries as versioned data contracts."
//
// These six registries are landed as versioned JSON files under data/canon/ (byte-identical to
// their source archives, hash-recorded in data/canon/MANIFEST.json) -- NOT merged into the
// opportunities/messageVariants/experiments/ownerGates tables directly. Two reasons:
//   1. Per the merge directives ("prohibited: second store, second opportunity table"), these
//      registries are policy/reference catalogs (lane definitions, gate acceptance criteria,
//      message templates, an attribution contract, a list of companies needing live
//      revalidation) -- not per-company data rows shaped like commercial-intelligence-import.mjs's
//      schema. Forcing them into that schema would require fabricating organization_domain /
//      expected_value_cents / etc. values that do not exist in the source data.
//   2. A registry entry becomes a REAL, live opportunities/messageVariants/ownerGates row only once
//      it is grounded in one specific company via the existing, already-audited
//      commercial-intelligence-import.mjs pipeline -- exactly the same path any other opportunity
//      takes. This module only reads and validates the static catalogs; it has no store dependency
//      and no write path of any kind.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CANON_DATA_DIR = path.resolve('data/canon');
const cache = new Map();

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function loadManifest() {
  if (!cache.has('__manifest__')) {
    cache.set('__manifest__', JSON.parse(fs.readFileSync(path.join(CANON_DATA_DIR, 'MANIFEST.json'), 'utf8')));
  }
  return cache.get('__manifest__');
}

/** Reads + parses one Canon data file, verifying it still matches the sha256 recorded in
 * data/canon/MANIFEST.json when this registry was landed -- an unnoticed edit to a "versioned data
 * contract" is exactly the kind of silent drift a hash check exists to catch. Throws loudly rather
 * than returning stale/mismatched data. */
function loadCanonFile(relativePath) {
  if (cache.has(relativePath)) return cache.get(relativePath);
  const manifest = loadManifest();
  const entry = manifest.files.find(file => file.path === relativePath);
  if (!entry) throw new Error(`Canon data file not in manifest: ${relativePath}`);
  const filePath = path.join(CANON_DATA_DIR, relativePath);
  const digest = sha256File(filePath);
  if (digest !== entry.sha256) {
    throw new Error(`Canon data file ${relativePath} does not match its recorded manifest hash -- refusing to load drifted data (expected ${entry.sha256}, got ${digest})`);
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  cache.set(relativePath, parsed);
  return parsed;
}

export const loadOfferPortfolio = () => loadCanonFile('registries/CANONICAL_OFFER_PORTFOLIO.json');
export const loadExperimentRegistry = () => loadCanonFile('registries/EXPERIMENT_REGISTRY.json');
export const loadGateRegistry = () => loadCanonFile('registries/COMMERCIAL_GATE_REGISTRY.json');
export const loadMessageVariantRegistry = () => loadCanonFile('registries/MESSAGE_VARIANT_REGISTRY.json');
export const loadAttributionContract = () => loadCanonFile('registries/ATTRIBUTION_CONTRACT.json');
export const loadRevalidationQueue = () => loadCanonFile('registries/UNIQUE_COMPANY_REVALIDATION_QUEUE.json');
export const loadResearchSeedCorpus = () => loadCanonFile('research-seed/UBERBOND_IMPORT.json');

/** Every company in the revalidation queue is, by the source data's own convention,
 * `send_eligible: false` and `canonical_state: 'RESEARCH_SEED_NEEDS_LIVE_REVALIDATION'`. This is a
 * read-only lookup, not an enforcement point -- the actual enforcement is structural: nothing in
 * prospect-supply.mjs or send-eligibility.mjs ever reads this file at all, so a company can only
 * ever become sendable by going through real evidence validation (validateProspectCandidate),
 * never by being present (or absent) from this list. */
export function isPendingRevalidation(domain) {
  const queue = loadRevalidationQueue();
  const target = String(domain || '').trim().toLowerCase();
  return queue.some(row => String(row.company_key || '').trim().toLowerCase() === target || String(row.official_website || '').toLowerCase().includes(target));
}

/** Test-only escape hatch -- clears the in-process cache so a test can point CANON_DATA_DIR-relative
 * loads at freshly written fixtures. Not used by any production code path. */
export function __resetCanonRegistryCache() { cache.clear(); }
