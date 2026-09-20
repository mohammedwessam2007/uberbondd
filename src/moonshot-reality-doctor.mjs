import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REALITY_STATES, HOLDING_OR_TERMINAL_STATES } from './moonshot-reality-compiler.mjs';

export const MOONSHOT_REALITY_DOCTOR_VERSION = 'uberbond.moonshot-reality-doctor.v3';

function validateVerifiedMechanisms({ verifiedMechanisms, canaryById, errors, warnings }) {
  if (!verifiedMechanisms || typeof verifiedMechanisms !== 'object') {
    errors.push('verified-mechanisms-required');
    return { count: 0, states: {} };
  }
  if (verifiedMechanisms.schemaVersion !== 'uberbond.moonshot-verified-child-mechanisms.v1') {
    errors.push('verified-mechanism-schema-invalid');
  }
  if (!Array.isArray(verifiedMechanisms.entries)) {
    errors.push('verified-mechanism-entries-required');
    return { count: 0, states: {} };
  }

  const ids = new Set();
  const states = {};
  for (const entry of verifiedMechanisms.entries) {
    const id = String(entry?.id || '');
    if (!id) errors.push('verified-mechanism-id-required');
    else if (ids.has(id)) errors.push(`duplicate-verified-mechanism:${id}`);
    else ids.add(id);

    const parent = canaryById.get(entry?.parentMoonshotId);
    if (!parent) errors.push(`verified-mechanism-parent-missing:${id || 'unknown'}`);

    if (!REALITY_STATES.includes(entry?.truthState)) {
      errors.push(`verified-mechanism-state-invalid:${id || 'unknown'}`);
    } else {
      states[entry.truthState] = (states[entry.truthState] || 0) + 1;
    }

    if (entry?.parentPromotionIndependent !== true) {
      errors.push(`verified-mechanism-parent-independence-required:${id || 'unknown'}`);
    }
    if (parent && entry?.parentTruthStateAtPromotion !== parent.realityState) {
      errors.push(`verified-mechanism-parent-state-mismatch:${id || 'unknown'}`);
    }
    if (entry?.externalEffectAuthority !== 'NONE') {
      errors.push(`verified-mechanism-effect-authority-must-be-none:${id || 'unknown'}`);
    }

    const history = entry?.promotionHistory;
    if (!Array.isArray(history) || history.length === 0) {
      errors.push(`verified-mechanism-promotion-history-required:${id || 'unknown'}`);
    } else {
      let expectedFrom = 'IMAGINED';
      for (const [index, row] of history.entries()) {
        const from = row?.from;
        const to = row?.to;
        if (!REALITY_STATES.includes(from) || !REALITY_STATES.includes(to)) {
          errors.push(`verified-mechanism-history-state-invalid:${id || 'unknown'}:${index}`);
          continue;
        }
        if (from !== expectedFrom) {
          errors.push(`verified-mechanism-history-chain-break:${id || 'unknown'}:${index}`);
        }
        if (REALITY_STATES.indexOf(to) !== REALITY_STATES.indexOf(from) + 1) {
          errors.push(`verified-mechanism-history-skip:${id || 'unknown'}:${index}`);
        }
        if (!row?.evidenceKind || !row?.evidenceRef) {
          errors.push(`verified-mechanism-history-evidence-required:${id || 'unknown'}:${index}`);
        }
        expectedFrom = to;
      }
      if (entry?.truthState && expectedFrom !== entry.truthState) {
        errors.push(`verified-mechanism-history-terminal-mismatch:${id || 'unknown'}`);
      }
    }

    if (REALITY_STATES.indexOf(entry?.truthState) >= REALITY_STATES.indexOf('SOFTWARE_DEMONSTRATED')) {
      const replication = entry?.replication;
      if (replication?.status !== 'MATCHED' ||
          !Number.isSafeInteger(replication?.implementationCount) ||
          replication.implementationCount < 2 ||
          replication?.mismatches !== 0) {
        errors.push(`verified-mechanism-replication-required:${id || 'unknown'}`);
      }
    }

    if (entry?.truthState === 'EPOCH_CANDIDATE') {
      warnings.push(`verified-mechanism-epoch-claim-needs-external-descendant-evidence:${id || 'unknown'}`);
    }
  }

  if (verifiedMechanisms?.law !== 'A_CHILD_MECHANISM_STATE_NEVER_AUTO_PROMOTES_ITS_PARENT_MOONSHOT') {
    errors.push('verified-mechanism-parent-promotion-law-required');
  }

  return { count: verifiedMechanisms.entries.length, states };
}

export function inspectMoonshotRealityProgram({
  program,
  canaries,
  registry,
  verifiedMechanisms
} = {}) {
  const errors = [];
  const warnings = [];

  if (!program || typeof program !== 'object') errors.push('program-required');
  if (!canaries || typeof canaries !== 'object') errors.push('canaries-required');
  if (!registry || typeof registry !== 'object') errors.push('registry-required');
  if (errors.length) return { ok: false, status: 'MOONSHOT_REALITY_DOCTOR_FAILED', errors, warnings };

  if (program.executableCore !== 'MOONSHOT_REALITY_COMPILER') errors.push('wrong-executable-core');
  if (registry.program !== 'MOONSHOT_REALITY_COMPILER') errors.push('registry-program-mismatch');

  const programRealityStates = new Set(program.realityStates || []);
  const registryRealityStates = new Set(registry.realityStates || []);
  const programTerminalStates = new Set(program.holdingOrTerminalStates || []);
  const registryTerminalStates = new Set(registry.holdingOrTerminalStates || []);

  for (const state of REALITY_STATES) {
    if (!programRealityStates.has(state)) errors.push(`program-missing-reality-state:${state}`);
    if (!registryRealityStates.has(state)) errors.push(`registry-missing-reality-state:${state}`);
  }
  for (const state of HOLDING_OR_TERMINAL_STATES) {
    if (!programTerminalStates.has(state)) errors.push(`program-missing-terminal-state:${state}`);
    if (!registryTerminalStates.has(state)) errors.push(`registry-missing-terminal-state:${state}`);
  }

  const canaryIds = new Set();
  const canaryById = new Map();
  for (const canary of canaries.canaries || []) {
    if (!canary?.id) errors.push('canary-id-required');
    else if (canaryIds.has(canary.id)) errors.push(`duplicate-canary:${canary.id}`);
    else {
      canaryIds.add(canary.id);
      canaryById.set(canary.id, canary);
    }

    if (canary?.realityState !== 'IMAGINED') warnings.push(`canary-not-imagined:${canary?.id || 'unknown'}`);
    if (!canary?.firstClaim || !canary?.firstProbe || !canary?.promotionBlocker) {
      errors.push(`canary-contract-incomplete:${canary?.id || 'unknown'}`);
    }
  }

  const verified = validateVerifiedMechanisms({
    verifiedMechanisms,
    canaryById,
    errors,
    warnings
  });

  if ((canaries.canaries || []).length < 5) errors.push('insufficient-cross-domain-canaries');
  if (!Array.isArray(program.hardTruth) || program.hardTruth.length === 0) errors.push('program-hard-truth-required');
  if (!Array.isArray(registry.hardTruth) || !registry.hardTruth.includes('REALITY_RETAINS_FINAL_VETO')) {
    errors.push('reality-final-veto-missing');
  }
  if (program?.coverageContract?.exactTranscriptImportRequiredForLiteralNoDropRegistry !== true) {
    errors.push('literal-no-drop-import-requirement-missing');
  }

  return {
    ok: errors.length === 0,
    status: errors.length ? 'MOONSHOT_REALITY_DOCTOR_FAILED' : 'MOONSHOT_REALITY_DOCTOR_OK',
    errors,
    warnings,
    counts: {
      canonicalRealityStates: REALITY_STATES.length,
      canonicalTerminalStates: HOLDING_OR_TERMINAL_STATES.length,
      canaries: (canaries.canaries || []).length,
      hardTruthRules: (registry.hardTruth || []).length,
      verifiedChildMechanisms: verified.count,
      verifiedChildMechanismStates: verified.states
    },
    truthBoundary:
      'DOCTOR_VALIDATES_INTERNAL_CONTRACTS_AND_CHILD_MECHANISM_STATE__NOT_PARENT_MOONSHOT_FEASIBILITY_OR_EXTERNAL_PROOF'
  };
}

export async function runMoonshotRealityDoctor({ rootDir = process.cwd() } = {}) {
  const [program, canaries, registry, verifiedMechanisms] = await Promise.all([
    fs.readFile(path.join(rootDir, 'config/possibility-civilization-program.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(rootDir, 'config/moonshot-reality-canaries.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(rootDir, 'config/moonshot-reality-program-registry.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(rootDir, 'config/moonshot-verified-child-mechanisms.json'), 'utf8').then(JSON.parse)
  ]);
  return inspectMoonshotRealityProgram({ program, canaries, registry, verifiedMechanisms });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await runMoonshotRealityDoctor({});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
