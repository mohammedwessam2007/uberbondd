import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRegistryAdapterRegistry } from '../src/company-registry-adapter.mjs';
import { createCompaniesHouseAdapter } from '../src/companies-house-adapter.mjs';
import { POLICY_RULE_CATALOG, compilePolicyEvidenceRow } from '../src/global-policy-evidence.mjs';

const MODULES = ['global-green-lane-router', 'global-policy-evidence', 'company-registry-adapter', 'companies-house-adapter', 'corporate-legal-form-verifier', 'recipient-address-classifier', 'invited-contact-classifier', 'contact-source-verifier', 'global-route-tournament', 'global-route-economics', 'green-lane-activation-truth', 'green-lane-discovery', 'host-family'];
const src = name => readFileSync(new URL(`../src/${name}.mjs`, import.meta.url), 'utf8');

test('ZERO_COST_DEFAULT: new modules import only node builtins and repository modules (no third-party package, no paid SDK)', () => {
  for (const name of MODULES) {
    const imports = [...src(name).matchAll(/^\s*import[^'"]*['"]([^'"]+)['"]/gm)].map(m => m[1]);
    for (const spec of imports) assert.ok(spec.startsWith('node:') || spec.startsWith('./'), `${name} imports ${spec}`);
  }
});

test('ZERO_COST_DEFAULT: no paid registry or enrichment vendor is referenced as a dependency', () => {
  const paid = /(opencorporates|dnb\.com|dun\s*&\s*bradstreet|zoominfo|apollo\.io|clearbit|hunter\.io|neverbounce|zerobounce|openai|anthropic\.com\/v1)/i;
  for (const name of MODULES) assert.ok(!paid.test(src(name).replace(/\/\/.*$/gm, '')), `${name} references a paid vendor`);
});

test('ZERO_COST_DEFAULT: a paid registry adapter is refused and never routed', () => {
  const reg = createRegistryAdapterRegistry([{ registryId: 'PAID', jurisdictions: ['GB'], resolve: async () => ({}), zeroCost: false }, createCompaniesHouseAdapter({ apiKey: '' })]);
  assert.deepEqual(reg.refused.map(r => r.reason), ['paid-registry-dependency-refused']);
  assert.equal(reg.forJurisdiction('GB').registryId, 'UK_COMPANIES_HOUSE');
});

test('NO_SEND_AUTHORITY_WIDENING: router and discovery modules never import dispatch, transport or mutation modules', () => {
  const forbidden = /(outbound-dispatch|outbound-worker|smtp-relay-transport|mailer|send-email|gmail|payment|stripe|dns|deploy|webhook)/i;
  for (const name of MODULES) {
    const imports = [...src(name).matchAll(/^\s*import[^'"]*['"]([^'"]+)['"]/gm)].map(m => m[1]);
    // Economics reads provider-reconciled payment truth (read-only) to attribute cleared revenue; it is the only module allowed a payment import.
    for (const spec of imports) assert.ok(!forbidden.test(spec) || (name === 'global-route-economics' && spec === './payment-renewal-truth.mjs'), `${name} imports ${spec}`);
    assert.ok(!/\bfetch\s*\(/.test(src(name)) || name === 'companies-house-adapter', `${name} performs network I/O`);
  }
});

test('NO_SEND_AUTHORITY_WIDENING: OWNER_AUTHORITY can satisfy no policy rule, so an owner row can never make a permissive rule fresh', () => {
  for (const spec of POLICY_RULE_CATALOG) assert.ok(!spec.allowedAuthorityTypes.includes('OWNER_AUTHORITY'), spec.ruleId);
  const row = compilePolicyEvidenceRow({ ruleId: POLICY_RULE_CATALOG[0].ruleId, authorityType: 'OWNER_AUTHORITY', sourceRef: 'x', retrievedAt: new Date().toISOString(), evidenceHash: 'f'.repeat(64) }, { now: new Date() });
  assert.notEqual(row.ok, true);
});

test('no credential value is ever embedded: the Companies House adapter source reads the key only from its argument', () => {
  assert.ok(!/COMPANIES_HOUSE_API_KEY/.test(src('companies-house-adapter')));
  assert.ok(!/console\.(log|error|warn)/.test(src('companies-house-adapter')));
});
