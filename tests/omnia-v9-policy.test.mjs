import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../src/omnia-v9/canonical.mjs';
import { buildPolicyBundle } from '../src/omnia-v9/policy-bundle.mjs';
import { assertCedarModule, cedarRuntimeIdentity, validateCedarPolicy, authorizeWithCedar } from '../src/omnia-v9/cedar-adapter.mjs';

const failClosedAnchor = 'A stage MUST fail closed when a critical input, authority, identity, policy, or calculation is unresolved.';
const learningAnchor = '- collection authority, credential scope, external-action permission, budgets, recipients, or approval authority;';

const constitutionManifest = {
  sources: [
    { role: 'DECISION_ENGINE', path: 'docs/constitution/decision-engine-v1.md' },
    { role: 'LEARNING_ENGINE', path: 'docs/constitution/learning-engine-v1.md' }
  ]
};
const sourceTextByRole = new Map([
  ['DECISION_ENGINE', `Decision law\n${failClosedAnchor}\n`],
  ['LEARNING_ENGINE', `Learning law\n${learningAnchor}\n`]
]);
const constitutionBundle = {
  constitutionDigest: sha256('constitution'),
  sourceSetDigest: sha256('source-set'),
  semantics: 'EXACT_SOURCE_BINDING_NOT_EXECUTABLE_POLICY'
};
const projection = {
  schemaVersion: 'omnia.v9.policy-projection.p3',
  projectionVersion: 'p3.0.0',
  semantics: 'TRACEABLE_PROJECTION_NOT_FULL_CONSTITUTION',
  rules: [
    { id: 'FAIL_CLOSED', effect: 'FORBID', sourceRole: 'DECISION_ENGINE', sourceAnchor: failClosedAnchor, mechanization: 'forbid unresolved' },
    { id: 'NO_LEARNING_SOVEREIGNTY', effect: 'FORBID', sourceRole: 'LEARNING_ENGINE', sourceAnchor: learningAnchor, mechanization: 'forbid learning sovereignty change' },
    { id: 'PERMIT_RESOLVED', effect: 'PERMIT', sourceRole: 'DECISION_ENGINE', sourceAnchor: failClosedAnchor, mechanization: 'permit resolved remainder' }
  ]
};
const schemaText = JSON.stringify({ UberBondV9: { entityTypes: {}, actions: {} } });
const policyText = 'permit(principal, action, resource);';
const evaluator = { packageName: '@cedar-policy/cedar-wasm', version: '4.1.0', importPath: '@cedar-policy/cedar-wasm/nodejs', cedarVersion: '4.1.0' };

function bundle(overrides = {}) {
  return buildPolicyBundle({ constitutionBundle, constitutionManifest, sourceTextByRole, projection, schemaText, policyText, evaluator, ...overrides });
}

function fakeCedar(overrides = {}) {
  return {
    getCedarVersion: () => '4.1.0',
    checkParseSchema: () => ({ type: 'success' }),
    checkParsePolicySet: () => ({ type: 'success' }),
    validate: () => ({ type: 'success', validationErrors: [], validationWarnings: [] }),
    isAuthorized: call => {
      const c = call.context;
      const allow = c.authorityResolved && c.identityResolved && c.evidenceResolved && c.policyBound && c.constitutionBound && !(c.proposalOrigin === 'LEARNING' && c.sovereigntyChange);
      return { type: 'success', response: { decision: allow ? 'Allow' : 'Deny', diagnostics: { reasons: [], errors: [] } } };
    },
    ...overrides
  };
}

function authorizationInput(overrides = {}) {
  return {
    cedar: fakeCedar(),
    validatedPolicy: { ok: true, schema: JSON.parse(schemaText) },
    policyText,
    actor: { id: 'worker1', tenantId: 'tenant1' },
    resource: { id: 'email:a@example.com', tenantId: 'tenant1', operation: 'email.send', effectClass: 'COMMUNICATE_EXTERNAL' },
    resolverFacts: {
      authorityResolved: true,
      identityResolved: true,
      evidenceResolved: true,
      policyBound: true,
      constitutionBound: true,
      proposalOrigin: 'OPERATOR',
      sovereigntyChange: false
    },
    ...overrides
  };
}

test('policy bundle binds constitution, policy, schema, projection and evaluator identity', () => {
  const result = bundle();
  assert.match(result.policyDigest, /^[a-f0-9]{64}$/);
  assert.equal(result.constitutionDigest, constitutionBundle.constitutionDigest);
  assert.equal(result.traceability.length, 3);
});

test('one-byte policy change changes policy digest', () => {
  assert.notEqual(bundle().policyDigest, bundle({ policyText: `${policyText}\n// changed` }).policyDigest);
});

test('one-byte schema change changes policy digest', () => {
  assert.notEqual(bundle().policyDigest, bundle({ schemaText: `${schemaText}\n ` }).policyDigest);
});

test('Cedar runtime engine version changes policy digest', () => {
  assert.notEqual(bundle().policyDigest, bundle({ evaluator: { ...evaluator, cedarVersion: '4.2.0' } }).policyDigest);
});

test('projection cannot call itself full constitution', () => {
  assert.throws(() => bundle({ projection: { ...projection, semantics: 'FULL_CONSTITUTION' } }), /projection contract/i);
});

test('rule referencing missing constitutional role is rejected', () => {
  const p = structuredClone(projection);
  p.rules[0].sourceRole = 'FAKE_CONSTITUTION';
  assert.throws(() => bundle({ projection: p }), /missing constitutional role/i);
});

test('literal source anchor must exist in exact source text', () => {
  const p = structuredClone(projection);
  p.rules[0].sourceAnchor = 'AI INVENTED THIS';
  assert.throws(() => bundle({ projection: p }), /not present in exact constitutional source/i);
});

test('duplicate projection rule IDs are rejected', () => {
  const p = structuredClone(projection);
  p.rules[1].id = p.rules[0].id;
  assert.throws(() => bundle({ projection: p }), /duplicate rule/i);
});

test('Cedar module contract requires runtime version function', () => {
  const cedar = fakeCedar();
  delete cedar.getCedarVersion;
  assert.throws(() => assertCedarModule(cedar), /contract incomplete/i);
});

test('runtime identity binds package and runtime-reported Cedar versions', () => {
  const identity = cedarRuntimeIdentity(fakeCedar(), { packageName: '@cedar-policy/cedar-wasm', packageVersion: '4.1.0', importPath: '@cedar-policy/cedar-wasm/nodejs' });
  assert.equal(identity.version, '4.1.0');
  assert.equal(identity.cedarVersion, '4.1.0');
});

test('schema parse failure blocks policy validation', () => {
  assert.throws(() => validateCedarPolicy({ cedar: fakeCedar({ checkParseSchema: () => ({ type: 'failure' }) }), schemaText, policyText }), /schema parse failed/i);
});

test('policy parse failure blocks policy validation', () => {
  assert.throws(() => validateCedarPolicy({ cedar: fakeCedar({ checkParsePolicySet: () => ({ type: 'failure' }) }), schemaText, policyText }), /policy parse failed/i);
});

test('strict Cedar validation errors block policy loading', () => {
  assert.throws(() => validateCedarPolicy({ cedar: fakeCedar({ validate: () => ({ type: 'success', validationErrors: [{ message: 'bad' }], validationWarnings: [] }) }), schemaText, policyText }), /validation produced errors/i);
});

test('all resolved non-sovereignty execution can be allowed', () => {
  assert.equal(authorizeWithCedar(authorizationInput()).decision, 'ALLOW');
});

test('unresolved authority fails closed', () => {
  const input = authorizationInput();
  input.resolverFacts.authorityResolved = false;
  assert.equal(authorizeWithCedar(input).decision, 'DENY');
});

test('unresolved evidence fails closed', () => {
  const input = authorizationInput();
  input.resolverFacts.evidenceResolved = false;
  assert.equal(authorizeWithCedar(input).decision, 'DENY');
});

test('learning-originated sovereignty expansion is denied', () => {
  const input = authorizationInput();
  input.resolverFacts.proposalOrigin = 'LEARNING';
  input.resolverFacts.sovereigntyChange = true;
  assert.equal(authorizeWithCedar(input).decision, 'DENY');
});

test('cross-tenant actor/resource relationship is denied before Cedar', () => {
  const input = authorizationInput();
  input.resource.tenantId = 'tenant2';
  assert.equal(authorizeWithCedar(input).decision, 'DENY');
});

test('Cedar evaluation exceptions fail closed', () => {
  const input = authorizationInput({ cedar: fakeCedar({ isAuthorized: () => { throw new Error('engine crash'); } }) });
  assert.equal(authorizeWithCedar(input).decision, 'DENY');
});

test('Cedar Allow with diagnostic errors is still denied', () => {
  const input = authorizationInput({ cedar: fakeCedar({ isAuthorized: () => ({ type: 'success', response: { decision: 'Allow', diagnostics: { errors: ['bad'] } } }) }) });
  assert.equal(authorizeWithCedar(input).decision, 'DENY');
});
