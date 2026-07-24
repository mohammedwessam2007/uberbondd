import test from 'node:test';
import assert from 'node:assert/strict';
import { validateServiceDefinition, assertValidServiceDefinition, assertValidServiceCatalog, ServiceRegistryError } from '../../revenue-os/src/service-registry.mjs';
import { SERVICE_CATALOG, getService } from '../../revenue-os/src/config.mjs';

function goodService(overrides = {}) {
  return {
    key: 'TEST_SERVICE', priceCents: 25000,
    publicName: 'Test Service', scope: 'A real scope description.', customerDefinition: 'A real customer definition.',
    disclaimers: ['Price is a launch offer set internally; it is not independently market-validated.'],
    checklistItems: ['Step one.'], evidenceRequirements: ['Evidence rule.'], approvals: ['Owner sign-off.'], deliverables: ['A report.'],
    ...overrides
  };
}

test('a fully-formed service definition validates', () => {
  const result = validateServiceDefinition(goodService());
  assert.equal(result.valid, true);
  assert.deepEqual(result.problems, []);
});

test('the real, current SERVICE_CATALOG in config.mjs validates end to end (module load already proved this; re-asserted here explicitly)', () => {
  for (const [key, service] of Object.entries(SERVICE_CATALOG)) {
    const result = validateServiceDefinition(service);
    assert.equal(result.valid, true, `${key}: ${result.problems.join(', ')}`);
  }
});

test('the mission-required offer registry is present with the exact required prices', () => {
  assert.equal(getService('FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC').priceCents, 25000);
  assert.equal(getService('AGENCY_CLIENT_RESCUE_PILOT').priceCents, 75000);
  assert.equal(getService('AGENCY_IMPLEMENTATION_PACKAGE').priceCents, 100000);
  assert.ok(getService('AGENCY_MONITORING').priceCentsMin > 0 && getService('AGENCY_MONITORING').priceCentsMax > 0);
});

// --- hostile: blank required text fields ---

test('hostile: blank or whitespace-only public name is rejected', () => {
  assert.equal(validateServiceDefinition(goodService({ publicName: '' })).valid, false);
  assert.equal(validateServiceDefinition(goodService({ publicName: '   ' })).valid, false);
  assert.ok(validateServiceDefinition(goodService({ publicName: '   ' })).problems.includes('blank-publicName'));
});

test('hostile: blank scope and customerDefinition are rejected', () => {
  assert.ok(validateServiceDefinition(goodService({ scope: '' })).problems.includes('blank-scope'));
  assert.ok(validateServiceDefinition(goodService({ customerDefinition: '\t\n ' })).problems.includes('blank-customerDefinition'));
});

// --- hostile: blank/missing required array fields ---

test('hostile: missing, empty, or blank-entry array fields are all rejected', () => {
  assert.ok(validateServiceDefinition(goodService({ disclaimers: undefined })).problems.includes('missing-disclaimers'));
  assert.ok(validateServiceDefinition(goodService({ checklistItems: [] })).problems.includes('missing-checklistItems'));
  assert.ok(validateServiceDefinition(goodService({ evidenceRequirements: ['   '] })).problems.includes('blank-entry-in-evidenceRequirements'));
  assert.ok(validateServiceDefinition(goodService({ approvals: ['real one', ''] })).problems.includes('blank-entry-in-approvals'));
  assert.ok(validateServiceDefinition(goodService({ deliverables: 'not-an-array' })).problems.includes('missing-deliverables'));
});

// --- hostile: price and market-validation disclaimer ---

test('hostile: missing price is rejected', () => {
  const svc = goodService();
  delete svc.priceCents;
  assert.ok(validateServiceDefinition(svc).problems.includes('missing-or-invalid-price'));
});

test('hostile: a priced service without the market-validation disclaimer is rejected', () => {
  const result = validateServiceDefinition(goodService({ disclaimers: ['some other disclaimer'] }));
  assert.equal(result.valid, false);
  assert.ok(result.problems.includes('missing-market-validation-disclaimer'));
});

test('hostile: a service claiming its price IS market-validated is still rejected (the disclaimer must say the opposite, not just mention the phrase)', () => {
  const result = validateServiceDefinition(goodService({ disclaimers: ['This price is fully market-validated.'] }));
  assert.equal(result.valid, false);
  assert.ok(result.problems.includes('missing-market-validation-disclaimer'));
});

test('hostile: null, undefined, and non-object service definitions are rejected without throwing', () => {
  assert.equal(validateServiceDefinition(null).valid, false);
  assert.equal(validateServiceDefinition(undefined).valid, false);
  assert.equal(validateServiceDefinition('not an object').valid, false);
  assert.equal(validateServiceDefinition(42).valid, false);
});

// --- assertion / catalog-level guards ---

test('assertValidServiceDefinition throws ServiceRegistryError with every problem listed', () => {
  assert.throws(() => assertValidServiceDefinition(goodService({ publicName: '' })), (err) => {
    assert.ok(err instanceof ServiceRegistryError);
    assert.ok(err.message.includes('blank-publicName'));
    return true;
  });
});

test('assertValidServiceCatalog throws on the first invalid entry in a catalog', () => {
  const catalog = { GOOD: goodService(), BAD: goodService({ publicName: '' }) };
  assert.throws(() => assertValidServiceCatalog(catalog), ServiceRegistryError);
});

test('assertValidServiceCatalog passes for a catalog where every entry is valid', () => {
  const catalog = { A: goodService({ key: 'A' }), B: goodService({ key: 'B' }) };
  assert.deepEqual(assertValidServiceCatalog(catalog), catalog);
});
