import crypto from 'node:crypto';
import { createAuthorityRoot } from './authority.mjs';
import { normalizePackageProvenance } from './package-provenance.mjs';
import { normalizeKernelAdapter, selectKernelAdapter } from './kernel-adapter.mjs';
import { defaultOsAssumptionPortfolio, compileAssumptionExperiment } from './unknown-unknown-lab.mjs';

export const UBEROS_SYSTEM_COMPILER_VERSION = 'uberos.system-compiler.v1';
const digest = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

export function compileUberOsManifest(manifest = {}) {
  const reasons = [];
  if (manifest.schemaVersion !== 'uberos.machine-manifest.v1') reasons.push('known-schema-version-required');
  if (!manifest.identity?.name || !manifest.identity?.generation) reasons.push('identity-name-and-generation-required');
  const root = createAuthorityRoot(manifest.authorityRoot || {});
  if (!root.ok) reasons.push(...root.reasonCodes.map(code => `authority:${code}`));
  const packages = (Array.isArray(manifest.packages) ? manifest.packages : []).map(normalizePackageProvenance);
  if (!packages.length) reasons.push('at-least-one-package-required');
  for (const row of packages.filter(row => !row.ok)) reasons.push(...row.reasonCodes.map(code => `package:${code}`));
  const adapters = (Array.isArray(manifest.kernelAdapters) ? manifest.kernelAdapters : []).map(normalizeKernelAdapter);
  if (!adapters.length) reasons.push('at-least-one-kernel-adapter-required');
  for (const row of adapters.filter(row => !row.ok)) reasons.push(...row.reasonCodes.map(code => `kernel:${code}`));
  const selected = selectKernelAdapter({ adapters: adapters.filter(row => row.ok).map(row => row.adapter), requiredCapabilities: manifest.requiredKernelCapabilities || [], preferredClass: manifest.preferredKernelClass || 'LINUX' });
  if (!selected.ok) reasons.push(...selected.reasonCodes.map(code => `kernel-selection:${code}`));
  const assumptions = (Array.isArray(manifest.assumptions) && manifest.assumptions.length ? manifest.assumptions : defaultOsAssumptionPortfolio()).map(compileAssumptionExperiment);
  for (const row of assumptions.filter(row => !row.ok)) reasons.push(...row.reasonCodes.map(code => `assumption:${code}`));
  const admissible = reasons.length === 0;
  const normalized = admissible ? { schemaVersion: manifest.schemaVersion, identity: manifest.identity, authorityRoot: root.authority, packages: packages.map(row => row.package), selectedKernel: selected.adapter, alternativeKernels: selected.alternatives, assumptions: assumptions.map(row => row.experiment), updatePolicy: manifest.updatePolicy || { strategy: 'CANDIDATE_SANDBOX_VERIFY_ATOMIC_PROMOTE_ROLLBACK', automaticConsequenceAuthorityExpansion: false }, aiPolicy: manifest.aiPolicy || { bootRequiresModel: false, deterministicRecoveryPathRequired: true, modelMayProposeChanges: true, modelMaySelfGrantAuthority: false } } : null;
  return { ok: admissible, status: admissible ? 'UBEROS_MANIFEST_COMPILED' : 'UBEROS_MANIFEST_REJECTED', reasonCodes: [...new Set(reasons)].sort(), manifest: normalized ? { ...normalized, manifestDigest: digest(normalized) } : null, truthBoundary: 'SOURCE_MANIFEST_COMPILATION_IS_NOT_A_BOOT_RECEIPT_OR_PHYSICAL_HOST_PROOF', consequenceAuthority: 'NONE' };
}
