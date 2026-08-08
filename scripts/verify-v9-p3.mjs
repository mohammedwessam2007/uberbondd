import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { bindConstitution, ConstitutionBindingError } from '../src/omnia-v9/constitution.mjs';
import { buildPolicyBundle } from '../src/omnia-v9/policy-bundle.mjs';
import { authorizeWithCedar, cedarRuntimeIdentity, loadCedarWasm, validateCedarPolicy, CedarAdapterError } from '../src/omnia-v9/cedar-adapter.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(import.meta.url);

async function readJson(relative) {
  return JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'));
}

async function resolveCedarPackageVersion() {
  const entry = require.resolve('@cedar-policy/cedar-wasm/nodejs');
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
  throw new CedarAdapterError('Unable to resolve installed Cedar package version', 'CEDAR_IDENTITY_INVALID');
}

async function bindRealConstitution() {
  const manifest = await readJson('config/omnia-v9/constitution-sources.json');
  const sourceBytesByRole = new Map();
  const sourceTextByRole = new Map();
  for (const source of manifest.sources) {
    const bytes = await fs.readFile(path.join(root, source.path));
    sourceBytesByRole.set(source.role, bytes);
    sourceTextByRole.set(source.role, bytes.toString('utf8'));
  }
  return { manifest, sourceTextByRole, bundle: bindConstitution({ manifest, sourceBytesByRole }) };
}

function probe({ cedar, validatedPolicy, policyText, resolverFacts }) {
  return authorizeWithCedar({
    cedar,
    validatedPolicy,
    policyText,
    actor: { id: 'verify-worker', tenantId: 'verify-tenant' },
    resource: { id: 'verify-resource', tenantId: 'verify-tenant', operation: 'verify.execute', effectClass: 'WRITE_INTERNAL' },
    resolverFacts
  });
}

async function run() {
  let constitution;
  try {
    constitution = await bindRealConstitution();
  } catch (error) {
    if (error instanceof ConstitutionBindingError) {
      return {
        schemaVersion: 'omnia.v9.verify.p3',
        status: error.code === 'INCOMPLETE' ? 'INCOMPLETE' : 'CANONICAL_CONFLICT',
        stage: 'constitution',
        reason: error.message,
        detail: error.detail
      };
    }
    if (error?.code === 'ENOENT') {
      return { schemaVersion: 'omnia.v9.verify.p3', status: 'INCOMPLETE', stage: 'constitution', reason: String(error.message) };
    }
    return { schemaVersion: 'omnia.v9.verify.p3', status: 'FAIL', stage: 'constitution', reason: String(error?.stack || error) };
  }

  const projection = await readJson('config/omnia-v9/policy-projection.json');
  const schemaText = await fs.readFile(path.join(root, 'policy/omnia-v9/schema.json'), 'utf8');
  const policyText = await fs.readFile(path.join(root, 'policy/omnia-v9/authorization.cedar'), 'utf8');

  let cedar;
  let runtimeIdentity;
  try {
    cedar = await loadCedarWasm();
    const packageVersion = await resolveCedarPackageVersion();
    runtimeIdentity = cedarRuntimeIdentity(cedar, {
      packageName: '@cedar-policy/cedar-wasm',
      packageVersion,
      importPath: '@cedar-policy/cedar-wasm/nodejs'
    });
  } catch (error) {
    if (error instanceof CedarAdapterError && ['CEDAR_UNAVAILABLE', 'CEDAR_IDENTITY_INVALID'].includes(error.code)) {
      return {
        schemaVersion: 'omnia.v9.verify.p3',
        status: 'INCOMPLETE',
        stage: 'cedar-runtime',
        constitutionDigest: constitution.bundle.constitutionDigest,
        reason: error.message,
        detail: error.detail,
        truthRule: 'Missing exact Cedar runtime validation is INCOMPLETE, never PASS.'
      };
    }
    return { schemaVersion: 'omnia.v9.verify.p3', status: 'FAIL', stage: 'cedar-runtime', reason: String(error?.stack || error) };
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
    return {
      schemaVersion: 'omnia.v9.verify.p3',
      status: 'FAIL',
      stage: 'policy-validation',
      constitutionDigest: constitution.bundle.constitutionDigest,
      reason: error.message || String(error),
      code: error.code || 'POLICY_VALIDATION'
    };
  }

  const resolved = {
    authorityResolved: true,
    identityResolved: true,
    evidenceResolved: true,
    policyBound: true,
    constitutionBound: true,
    proposalOrigin: 'OPERATOR',
    sovereigntyChange: false
  };
  const probes = [
    { id: 'resolved-non-sovereignty-allows', expected: 'ALLOW', result: probe({ cedar, validatedPolicy, policyText, resolverFacts: resolved }) },
    { id: 'unresolved-authority-denies', expected: 'DENY', result: probe({ cedar, validatedPolicy, policyText, resolverFacts: { ...resolved, authorityResolved: false } }) },
    { id: 'unresolved-evidence-denies', expected: 'DENY', result: probe({ cedar, validatedPolicy, policyText, resolverFacts: { ...resolved, evidenceResolved: false } }) },
    { id: 'unbound-constitution-denies', expected: 'DENY', result: probe({ cedar, validatedPolicy, policyText, resolverFacts: { ...resolved, constitutionBound: false } }) },
    { id: 'learning-sovereignty-denies', expected: 'DENY', result: probe({ cedar, validatedPolicy, policyText, resolverFacts: { ...resolved, proposalOrigin: 'LEARNING', sovereigntyChange: true } }) }
  ];
  const failedProbes = probes.filter(item => item.result.decision !== item.expected);
  if (failedProbes.length) {
    return {
      schemaVersion: 'omnia.v9.verify.p3',
      status: 'FAIL',
      stage: 'authorization-probes',
      constitutionDigest: constitution.bundle.constitutionDigest,
      policyDigest: policyBundle.policyDigest,
      failedProbes
    };
  }

  return {
    schemaVersion: 'omnia.v9.verify.p3',
    status: 'P3_POLICY_VERIFIED',
    constitutionDigest: constitution.bundle.constitutionDigest,
    sourceSetDigest: constitution.bundle.sourceSetDigest,
    policyDigest: policyBundle.policyDigest,
    evaluator: runtimeIdentity,
    strictValidationWarnings: validatedPolicy.warnings,
    traceability: policyBundle.traceability,
    probes: probes.map(item => ({ id: item.id, expected: item.expected, actual: item.result.decision })),
    truthRule: 'This verifies a selected traceable policy projection, not the entire Markdown constitution.'
  };
}

const report = await run();
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'P3_POLICY_VERIFIED' ? 0 : report.status === 'INCOMPLETE' ? 2 : 1);
