import { sha256 } from './canonical.mjs';

const SHA256_HEX = /^[a-f0-9]{64}$/i;

export class PolicyBundleError extends Error {
  constructor(message, code = 'POLICY_BUNDLE_INVALID', detail = {}) {
    super(message);
    this.name = 'PolicyBundleError';
    this.code = code;
    this.detail = detail;
  }
}

function assertPlainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PolicyBundleError(`${name} must be an object`);
}

function normalizedEvaluator(evaluator) {
  assertPlainObject(evaluator, 'evaluator');
  for (const field of ['packageName', 'version', 'importPath', 'cedarVersion']) {
    if (typeof evaluator[field] !== 'string' || !evaluator[field].trim()) throw new PolicyBundleError(`evaluator.${field} required`);
  }
  return {
    packageName: evaluator.packageName.trim(),
    version: evaluator.version.trim(),
    importPath: evaluator.importPath.trim(),
    cedarVersion: evaluator.cedarVersion.trim()
  };
}

function sourceForRole(constitutionManifest, role) {
  return constitutionManifest.sources?.find(source => source.role === role) || null;
}

export function buildPolicyBundle({ constitutionBundle, constitutionManifest, sourceTextByRole, projection, schemaText, policyText, evaluator }) {
  assertPlainObject(constitutionBundle, 'constitutionBundle');
  assertPlainObject(constitutionManifest, 'constitutionManifest');
  assertPlainObject(projection, 'projection');
  if (!(sourceTextByRole instanceof Map)) throw new PolicyBundleError('sourceTextByRole must be a Map', 'UNTRACEABLE_RULE');
  if (!SHA256_HEX.test(String(constitutionBundle.constitutionDigest || ''))) throw new PolicyBundleError('constitutionDigest must be sha256', 'CONSTITUTION_UNBOUND');
  if (!SHA256_HEX.test(String(constitutionBundle.sourceSetDigest || ''))) throw new PolicyBundleError('sourceSetDigest must be sha256', 'CONSTITUTION_UNBOUND');
  if (constitutionBundle.semantics !== 'EXACT_SOURCE_BINDING_NOT_EXECUTABLE_POLICY') throw new PolicyBundleError('unexpected constitution semantics', 'CONSTITUTION_UNBOUND');
  if (projection.schemaVersion !== 'omnia.v9.policy-projection.p3' || projection.semantics !== 'TRACEABLE_PROJECTION_NOT_FULL_CONSTITUTION') {
    throw new PolicyBundleError('unsupported projection contract');
  }
  if (!Array.isArray(projection.rules) || projection.rules.length === 0) throw new PolicyBundleError('projection rules required');
  if (typeof schemaText !== 'string' || !schemaText.trim()) throw new PolicyBundleError('schemaText required');
  if (typeof policyText !== 'string' || !policyText.trim()) throw new PolicyBundleError('policyText required');

  const ruleIds = new Set();
  const traceability = projection.rules.map(rule => {
    if (!rule?.id || !rule?.sourceRole || !rule?.sourceAnchor || !rule?.mechanization || !['PERMIT', 'FORBID'].includes(rule.effect)) {
      throw new PolicyBundleError('projection rule incomplete', 'UNTRACEABLE_RULE', { rule });
    }
    if (ruleIds.has(rule.id)) throw new PolicyBundleError(`duplicate rule ${rule.id}`, 'UNTRACEABLE_RULE');
    ruleIds.add(rule.id);
    const source = sourceForRole(constitutionManifest, rule.sourceRole);
    if (!source) throw new PolicyBundleError(`rule ${rule.id} references missing constitutional role`, 'UNTRACEABLE_RULE');
    const sourceText = sourceTextByRole.get(rule.sourceRole);
    if (typeof sourceText !== 'string' || !sourceText.includes(rule.sourceAnchor)) {
      throw new PolicyBundleError(`rule ${rule.id} anchor is not present in exact constitutional source`, 'UNTRACEABLE_RULE', { role: rule.sourceRole, anchor: rule.sourceAnchor });
    }
    return {
      id: rule.id,
      effect: rule.effect,
      sourceRole: rule.sourceRole,
      sourcePath: source.path,
      sourceDocumentSha256: sha256(sourceText),
      sourceAnchorSha256: sha256(rule.sourceAnchor),
      sourceAnchor: rule.sourceAnchor,
      mechanizationSha256: sha256(rule.mechanization)
    };
  }).sort((a, b) => a.id.localeCompare(b.id));

  const runtime = normalizedEvaluator(evaluator);
  const schemaSha256 = sha256(schemaText);
  const policySha256 = sha256(policyText);
  const projectionSha256 = sha256(projection);
  const core = {
    schemaVersion: 'omnia.v9.policy-bundle.p3',
    projectionVersion: projection.projectionVersion,
    semantics: 'TRACEABLE_PROJECTION_NOT_FULL_CONSTITUTION',
    constitutionDigest: constitutionBundle.constitutionDigest,
    sourceSetDigest: constitutionBundle.sourceSetDigest,
    schemaSha256,
    policySha256,
    projectionSha256,
    evaluator: runtime,
    traceability
  };
  return { ...core, policyDigest: sha256(core) };
}
