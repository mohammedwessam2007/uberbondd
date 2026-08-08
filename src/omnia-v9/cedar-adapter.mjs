const REQUIRED_FUNCTIONS = ['checkParseSchema', 'checkParsePolicySet', 'validate', 'isAuthorized'];

export class CedarAdapterError extends Error {
  constructor(message, code = 'CEDAR_ADAPTER_ERROR', detail = {}) {
    super(message);
    this.name = 'CedarAdapterError';
    this.code = code;
    this.detail = detail;
  }
}

function assertCedarModule(cedar) {
  if (!cedar || typeof cedar !== 'object') throw new CedarAdapterError('Cedar module missing', 'CEDAR_UNAVAILABLE');
  const missing = REQUIRED_FUNCTIONS.filter(name => typeof cedar[name] !== 'function');
  if (missing.length) throw new CedarAdapterError('Cedar module contract incomplete', 'CEDAR_CONTRACT_MISMATCH', { missing });
}

function parseJson(text, name) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CedarAdapterError(`${name} JSON parse failed`, 'POLICY_BUNDLE_INVALID', { message: String(error?.message || error) });
  }
}

export function validateCedarPolicy({ cedar, schemaText, policyText }) {
  assertCedarModule(cedar);
  if (typeof schemaText !== 'string' || !schemaText.trim()) throw new CedarAdapterError('schemaText required', 'POLICY_BUNDLE_INVALID');
  if (typeof policyText !== 'string' || !policyText.trim()) throw new CedarAdapterError('policyText required', 'POLICY_BUNDLE_INVALID');

  const schema = parseJson(schemaText, 'schema');
  const schemaParse = cedar.checkParseSchema(schema);
  if (!schemaParse || schemaParse.type !== 'success') {
    throw new CedarAdapterError('Cedar schema parse failed', 'CEDAR_SCHEMA_INVALID', { result: schemaParse });
  }

  const policyParse = cedar.checkParsePolicySet(policyText);
  if (!policyParse || policyParse.type !== 'success') {
    throw new CedarAdapterError('Cedar policy parse failed', 'CEDAR_POLICY_INVALID', { result: policyParse });
  }

  const validation = cedar.validate({
    validationSettings: { mode: 'strict' },
    schema,
    policies: policyText
  });
  if (!validation || validation.type !== 'success') {
    throw new CedarAdapterError('Cedar validation call failed', 'CEDAR_VALIDATION_FAILURE', { result: validation });
  }
  const errors = Array.isArray(validation.validationErrors) ? validation.validationErrors : [];
  const warnings = Array.isArray(validation.validationWarnings) ? validation.validationWarnings : [];
  if (errors.length) {
    throw new CedarAdapterError('Cedar strict validation produced errors', 'CEDAR_POLICY_INVALID', { errors, warnings });
  }
  return { ok: true, schema, warnings };
}

function requireResolverFacts(facts) {
  const requiredBooleans = ['authorityResolved', 'identityResolved', 'evidenceResolved', 'policyBound', 'constitutionBound', 'sovereigntyChange'];
  const errors = [];
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) return ['resolverFacts:not-object'];
  for (const key of requiredBooleans) if (typeof facts[key] !== 'boolean') errors.push(`resolverFacts:${key}:not-boolean`);
  if (typeof facts.proposalOrigin !== 'string' || !facts.proposalOrigin.trim()) errors.push('resolverFacts:proposalOrigin:missing');
  return errors;
}

export function authorizeWithCedar({ cedar, validatedPolicy, policyText, actor, resource, resolverFacts }) {
  assertCedarModule(cedar);
  const factErrors = requireResolverFacts(resolverFacts);
  if (factErrors.length) return { decision: 'DENY', reasons: factErrors, cedarDecision: null, diagnostics: [] };
  if (!validatedPolicy?.ok || !validatedPolicy.schema) return { decision: 'DENY', reasons: ['cedar:policy-not-validated'], cedarDecision: null, diagnostics: [] };
  if (!actor?.id || !actor?.tenantId || !resource?.id || !resource?.tenantId || !resource?.operation || !resource?.effectClass) {
    return { decision: 'DENY', reasons: ['cedar:invalid-entity-input'], cedarDecision: null, diagnostics: [] };
  }
  if (actor.tenantId !== resource.tenantId) return { decision: 'DENY', reasons: ['cedar:tenant-mismatch'], cedarDecision: null, diagnostics: [] };

  const entities = [
    {
      uid: { type: 'UberBondV9::Actor', id: String(actor.id) },
      attrs: { tenantId: String(actor.tenantId) },
      parents: []
    },
    {
      uid: { type: 'UberBondV9::GovernedResource', id: String(resource.id) },
      attrs: {
        tenantId: String(resource.tenantId),
        operation: String(resource.operation),
        effectClass: String(resource.effectClass)
      },
      parents: []
    }
  ];

  let result;
  try {
    result = cedar.isAuthorized({
      principal: { type: 'UberBondV9::Actor', id: String(actor.id) },
      action: { type: 'UberBondV9::Action', id: 'execute' },
      resource: { type: 'UberBondV9::GovernedResource', id: String(resource.id) },
      context: {
        authorityResolved: resolverFacts.authorityResolved,
        identityResolved: resolverFacts.identityResolved,
        evidenceResolved: resolverFacts.evidenceResolved,
        policyBound: resolverFacts.policyBound,
        constitutionBound: resolverFacts.constitutionBound,
        proposalOrigin: resolverFacts.proposalOrigin,
        sovereigntyChange: resolverFacts.sovereigntyChange
      },
      policies: policyText,
      entities,
      schema: validatedPolicy.schema
    });
  } catch (error) {
    return { decision: 'DENY', reasons: [`cedar:exception:${String(error?.message || error)}`], cedarDecision: null, diagnostics: [] };
  }

  if (!result || result.type !== 'success') {
    return { decision: 'DENY', reasons: ['cedar:evaluation-failure'], cedarDecision: null, diagnostics: result ? [result] : [] };
  }
  const cedarDecision = result.response?.decision;
  const diagnostics = result.response?.diagnostics || {};
  if (cedarDecision !== 'Allow') {
    return { decision: 'DENY', reasons: ['cedar:not-allowed'], cedarDecision, diagnostics };
  }
  if (Array.isArray(diagnostics.errors) && diagnostics.errors.length) {
    return { decision: 'DENY', reasons: ['cedar:diagnostic-errors'], cedarDecision, diagnostics };
  }
  return { decision: 'ALLOW', reasons: ['cedar:allow'], cedarDecision, diagnostics };
}

export async function loadCedarWasm() {
  try {
    return await import('@cedar-policy/cedar-wasm/nodejs');
  } catch (error) {
    throw new CedarAdapterError('Cedar WASM package is not available', 'CEDAR_UNAVAILABLE', { message: String(error?.message || error) });
  }
}
