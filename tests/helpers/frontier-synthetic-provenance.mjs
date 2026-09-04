import { buildFrontierCallabilityProbeReceipt } from '../../src/frontier-callability-provenance.mjs';
import { compileFrontierCognitivePlan as compileRawFrontierCognitivePlan } from '../../src/frontier-cognitive-fabric.mjs';

// Explicit test-only seam. The receipt establishes only a synthetic producer
// envelope; the raw callability values remain untouched so hostile evidence,
// freshness and identity cases are still evaluated by the real compiler.
export function compileSyntheticFrontierPlan(options = {}) {
  if (options.callabilityProvenance || !Array.isArray(options.callability) || options.callability.length === 0) {
    return compileRawFrontierCognitivePlan(options);
  }
  const observedAt = options.now ?? new Date();
  const built = buildFrontierCallabilityProbeReceipt({
    observations: options.callability.map((item, index) => ({
      ...item,
      status: 'CALLABLE_NOW',
      evidenceClass: 'OBSERVED_RUNTIME',
      identityVerification: 'OBSERVED',
      providerRequestId: item.providerRequestId ?? `synthetic-frontier-test-${item.profileId ?? index}`
    })),
    sourceRef: 'synthetic://frontier-test-compiler',
    observedAt
  });
  if (!built.ok) return built;
  return compileRawFrontierCognitivePlan({
    ...options,
    callabilityProvenance: { receipt: built.receipt, receiptDigest: built.receiptDigest }
  });
}
