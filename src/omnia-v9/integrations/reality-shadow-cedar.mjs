import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { bindConstitution, ConstitutionBindingError } from '../constitution.mjs';
import { buildPolicyBundle, PolicyBundleError } from '../policy-bundle.mjs';
import { authorizeWithCedar, cedarRuntimeIdentity, loadCedarWasm, validateCedarPolicy, CedarAdapterError } from '../cedar-adapter.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const require = createRequire(import.meta.url);

/**
 * Thrown by bindRealCedarAuthority() for every failure mode. code/stage let
 * callers classify the failure the same way scripts/verify-v9-p3.mjs does:
 * CEDAR_UNAVAILABLE / CEDAR_IDENTITY_INVALID / missing config -> INCOMPLETE
 * (a real Cedar validation was never obtained), anything else -> ERROR.
 * Never a code path that produces ALLOW.
 */
export class RealCedarBindingError extends Error {
  constructor(message, code, stage, detail = {}) {
    super(message);
    this.name = 'RealCedarBindingError';
    this.code = code;
    this.stage = stage;
    this.detail = detail;
  }
}

const INCOMPLETE_CODES = new Set(['CEDAR_UNAVAILABLE', 'CEDAR_IDENTITY_INVALID', 'CONFIG_MISSING']);

export function classifyRealCedarFailure(error) {
  if (error instanceof RealCedarBindingError) return INCOMPLETE_CODES.has(error.code) ? 'V9_INCOMPLETE' : 'V9_ERROR';
  return 'V9_ERROR';
}

const CONTROL_PLANE_PATTERN = /(approval|authority|credential|policy|constitution|budget|recipient[-_. ]?scope|collection[-_. ]?scope|external[-_. ]?permission|kill[-_. ]?switch)/i;
const OPERATOR_ACTORS = new Set(['uberbond-outbound-worker', 'uberbond-canary-worker', 'mohamed']);

/**
 * Proposal provenance and sovereignty impact are derived only from the signed
 * action intent. Unknown actors fail closed as learning-origin control-plane
 * changes; callers cannot supply friendlier resolver facts to override this.
 */
export function deriveProposalFacts(intent) {
  const actorId = String(intent?.actorId || '');
  const operation = String(intent?.operation || '');
  const resource = String(intent?.resource || '');
  const purpose = String(intent?.purpose || '');
  const explicitlyLearning = /(^|[:/._-])learning([:/._-]|$)/i.test(actorId);
  const explicitlyOperator = OPERATOR_ACTORS.has(actorId) || /^(owner|operator)[:/]/i.test(actorId);
  const actorKnown = explicitlyLearning || explicitlyOperator;
  const sovereigntyChange = !actorKnown || CONTROL_PLANE_PATTERN.test(`${operation}\n${resource}\n${purpose}`);
  return {
    proposalOrigin: explicitlyOperator ? 'OPERATOR' : 'LEARNING',
    sovereigntyChange
  };
}

async function readJson(relative) {
  try {
    return JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') throw new RealCedarBindingError(`missing required config: ${relative}`, 'CONFIG_MISSING', 'config', { relative });
    throw new RealCedarBindingError(`unreadable config: ${relative}`, 'CONFIG_INVALID', 'config', { relative, message: String(error?.message || error) });
  }
}

async function readText(relative) {
  try {
    return await fs.readFile(path.join(root, relative), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') throw new RealCedarBindingError(`missing required file: ${relative}`, 'CONFIG_MISSING', 'config', { relative });
    throw new RealCedarBindingError(`unreadable file: ${relative}`, 'CONFIG_INVALID', 'config', { relative, message: String(error?.message || error) });
  }
}

async function resolveCedarPackageVersion() {
  let entry;
  try {
    entry = require.resolve('@cedar-policy/cedar-wasm/nodejs');
  } catch (error) {
    throw new RealCedarBindingError('Cedar WASM package is not resolvable', 'CEDAR_UNAVAILABLE', 'cedar-runtime', { message: String(error?.message || error) });
  }
  let cursor = path.dirname(entry);
  for (let i = 0; i < 12; i += 1) {
    const candidate = path.join(cursor, 'package.json');
    try {
      const pkg = JSON.parse(await fs.readFile(candidate, 'utf8'));
      if (pkg.name === '@cedar-policy/cedar-wasm' && typeof pkg.version === 'string') return pkg.version;
    } catch {}
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  throw new RealCedarBindingError('Unable to resolve installed Cedar package version', 'CEDAR_IDENTITY_INVALID', 'cedar-runtime');
}

async function bindRealConstitution() {
  const manifest = await readJson('config/omnia-v9/constitution-sources.json');
  const sourceBytesByRole = new Map();
  const sourceTextByRole = new Map();
  for (const source of manifest.sources) {
    let bytes;
    try {
      bytes = await fs.readFile(path.join(root, source.path));
    } catch (error) {
      if (error?.code === 'ENOENT') throw new RealCedarBindingError(`missing constitution source: ${source.path}`, 'CONFIG_MISSING', 'constitution', { role: source.role, path: source.path });
      throw new RealCedarBindingError(`unreadable constitution source: ${source.path}`, 'CONFIG_INVALID', 'constitution', { role: source.role, path: source.path });
    }
    sourceBytesByRole.set(source.role, bytes);
    sourceTextByRole.set(source.role, bytes.toString('utf8'));
  }
  try {
    return { manifest, sourceTextByRole, bundle: bindConstitution({ manifest, sourceBytesByRole }) };
  } catch (error) {
    if (error instanceof ConstitutionBindingError) {
      throw new RealCedarBindingError(error.message, error.code === 'INCOMPLETE' ? 'CONFIG_MISSING' : 'CONSTITUTION_INVALID', 'constitution', error.detail);
    }
    throw error;
  }
}

let cachedAuthorityPromise = null;

/**
 * Loads the real, closure-verified Cedar runtime (@cedar-policy/cedar-wasm),
 * binds the real frozen constitution and policy bundle, and returns a
 * synchronous policyAuthorizer usable directly as admitAction()'s
 * context.policyAuthorizer. No mock, no duplicate parser: this is the exact
 * loadCedarWasm/bindConstitution/buildPolicyBundle/validateCedarPolicy
 * sequence already exercised by scripts/verify-v9-p3.mjs.
 *
 * Any failure throws RealCedarBindingError before a policyAuthorizer is ever
 * produced -- callers must not fall back to a fabricated ALLOW authorizer.
 * Result is cached (Cedar/policy/constitution binding is process-lifetime
 * stable and re-binding per decision would be pure overhead); pass
 * { fresh: true } to force a rebind (used by policy-change drills).
 */
export async function bindRealCedarAuthority({ fresh = false } = {}) {
  if (!fresh && cachedAuthorityPromise) return cachedAuthorityPromise;
  const promise = (async () => {
    const constitution = await bindRealConstitution();
    const projection = await readJson('config/omnia-v9/policy-projection.json');
    const schemaText = await readText('policy/omnia-v9/schema.json');
    const policyText = await readText('policy/omnia-v9/authorization.cedar');

    let cedar;
    let runtimeIdentity;
    try {
      cedar = await loadCedarWasm();
    } catch (error) {
      if (error instanceof CedarAdapterError) throw new RealCedarBindingError(error.message, error.code, 'cedar-runtime', error.detail);
      throw new RealCedarBindingError(String(error?.message || error), 'CEDAR_UNAVAILABLE', 'cedar-runtime');
    }
    const packageVersion = await resolveCedarPackageVersion();
    try {
      runtimeIdentity = cedarRuntimeIdentity(cedar, {
        packageName: '@cedar-policy/cedar-wasm',
        packageVersion,
        importPath: '@cedar-policy/cedar-wasm/nodejs'
      });
    } catch (error) {
      if (error instanceof CedarAdapterError) throw new RealCedarBindingError(error.message, error.code, 'cedar-runtime', error.detail);
      throw error;
    }

    let policyBundle;
    let validatedPolicy;
    try {
      policyBundle = buildPolicyBundle({
        constitutionBundle: constitution.bundle,
        constitutionManifest: constitution.manifest,
        sourceTextByRole: constitution.sourceTextByRole,
        projection,
        schemaText,
        policyText,
        evaluator: runtimeIdentity
      });
      validatedPolicy = validateCedarPolicy({ cedar, schemaText, policyText });
    } catch (error) {
      const code = error instanceof CedarAdapterError ? error.code : (error instanceof PolicyBundleError ? error.code : 'POLICY_VALIDATION');
      throw new RealCedarBindingError(error.message || String(error), code, 'policy-validation', error.detail);
    }

    function policyAuthorizer({ intent, binding = {}, resolverFacts: resolved = {} }) {
      const proposalFacts = deriveProposalFacts(intent);
      const resolverFacts = {
        authorityResolved: resolved.authorityResolved === true,
        identityResolved: resolved.identityResolved === true,
        evidenceResolved: resolved.evidenceResolved === true,
        policyBound: String(binding.policyDigest || '') === policyBundle.policyDigest && Boolean(String(binding.policyVersion || '').trim()),
        constitutionBound: String(binding.constitutionDigest || '') === constitution.bundle.constitutionDigest,
        ...proposalFacts
      };
      const actor = { id: intent.actorId, tenantId: intent.tenantId };
      const resource = { id: intent.resource, tenantId: intent.tenantId, operation: intent.operation, effectClass: intent.effectClass };
      const outcome = authorizeWithCedar({ cedar, validatedPolicy, policyText, actor, resource, resolverFacts });
      return { decision: outcome.decision, reasons: outcome.reasons, cedarDecision: outcome.cedarDecision, diagnostics: outcome.diagnostics };
    }

    return {
      policyAuthorizer,
      policyDigest: policyBundle.policyDigest,
      constitutionDigest: constitution.bundle.constitutionDigest,
      sourceSetDigest: constitution.bundle.sourceSetDigest,
      evaluator: runtimeIdentity,
      cedarVersion: runtimeIdentity.cedarVersion,
      traceability: policyBundle.traceability,
      strictValidationWarnings: validatedPolicy.warnings
    };
  })();
  cachedAuthorityPromise = promise;
  try {
    return await promise;
  } catch (error) {
    cachedAuthorityPromise = null;
    throw error;
  }
}

export function resetRealCedarAuthorityCache() {
  cachedAuthorityPromise = null;
}
