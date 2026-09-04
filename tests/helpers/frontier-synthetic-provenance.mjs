import { buildFrontierCallabilityProbeReceipt } from '../../src/frontier-callability-provenance.mjs';
import { compileFrontierCognitivePlan as compileRawFrontierCognitivePlan } from '../../src/frontier-cognitive-fabric.mjs';

// Explicit test-only seam. The returned plan is backed by a receipt that is
// permanently simulationOnly and therefore cannot authorize default live execution.
export function compileSyntheticFrontierPlan(options = {}) {
  if (options.callabilityProvenance || !Array.isArray(options.callability) || options.callability.length === 0) {
    return compileRawFrontierCognitivePlan(options);
  }
  const observedAt = options.now ?? new Date();
  const built = buildFrontierCallabilityProbeReceipt({
    observations: options.callability.map((item, index) => ({
      ...item,
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
