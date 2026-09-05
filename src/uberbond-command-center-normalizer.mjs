import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const UBERBOND_COMMAND_CENTER_NORMALIZER_POLICY_VERSION = 'uberbond-command-center-normalizer-1.0.0';

const scalar = value => ['string', 'number', 'boolean'].includes(typeof value) ? value : null;

async function readFrontierRegistry(root) {
  try {
    const raw = await readFile(path.resolve(root, 'config/frontier-model-candidates.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  } catch {
    return [];
  }
}

export async function normalizeUberBondCommandCenterStatus(status, { root = process.cwd() } = {}) {
  if (!status || typeof status !== 'object' || Array.isArray(status)) return status;
  const out = structuredClone(status);

  // The implementation ledger names two independent dimensions differently
  // from Feature Atom Atlas: `maturity` is primitive completeness while
  // `status` is evidence maturity. Give the UI explicit semantic names instead
  // of making it infer which vocabulary produced the receipt.
  const ledger = out.genesisImplementationLedger;
  if (ledger && typeof ledger === 'object') {
    ledger.primitiveMaturityCounts = ledger.maturityCounts && typeof ledger.maturityCounts === 'object'
      ? ledger.maturityCounts : {};
    ledger.evidenceStatusCounts = ledger.implementationStatusCounts && typeof ledger.implementationStatusCounts === 'object'
      ? ledger.implementationStatusCounts : {};
  }

  // Candidate catalog truth uses `canonicalModel`. The first status compiler
  // deliberately emitted a tiny subset and did not retain that field. Rejoin it
  // by stable candidate id from the fixed repository source so the command
  // center shows the exact catalog model id without turning catalog presence
  // into callability proof.
  const registry = await readFrontierRegistry(root);
  const byId = new Map(registry.map(candidate => [candidate?.id, candidate]));
  if (Array.isArray(out.frontierModelRegistry?.candidates)) {
    out.frontierModelRegistry.candidates = out.frontierModelRegistry.candidates.map(candidate => {
      const source = byId.get(candidate?.id);
      return {
        ...candidate,
        model: scalar(source?.canonicalModel) || scalar(source?.model) || scalar(source?.modelId) || candidate?.model || null,
        configured: source?.configured === true,
        availabilityTruth: scalar(source?.availabilityTruth)
      };
    });
  }

  out.commandCenterNormalizerPolicyVersion = UBERBOND_COMMAND_CENTER_NORMALIZER_POLICY_VERSION;
  return out;
}
