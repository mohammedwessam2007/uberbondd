import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REALITY_STATES, HOLDING_OR_TERMINAL_STATES } from './moonshot-reality-compiler.mjs';

export const MOONSHOT_REALITY_DOCTOR_VERSION = 'uberbond.moonshot-reality-doctor.v2';

export function inspectMoonshotRealityProgram({ program, canaries, registry } = {}) {
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
  for (const canary of canaries.canaries || []) {
    if (!canary?.id) errors.push('canary-id-required');
    else if (canaryIds.has(canary.id)) errors.push(`duplicate-canary:${canary.id}`);
    else canaryIds.add(canary.id);

    if (canary?.realityState !== 'IMAGINED') warnings.push(`canary-not-imagined:${canary?.id || 'unknown'}`);
    if (!canary?.firstClaim || !canary?.firstProbe || !canary?.promotionBlocker) {
      errors.push(`canary-contract-incomplete:${canary?.id || 'unknown'}`);
    }
  }

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
      hardTruthRules: (registry.hardTruth || []).length
    },
    truthBoundary: 'DOCTOR_VALIDATES_INTERNAL_CONTRACTS__NOT_MOONSHOT_FEASIBILITY_OR_EXTERNAL_PROOF'
  };
}

export async function runMoonshotRealityDoctor({ rootDir = process.cwd() } = {}) {
  const [program, canaries, registry] = await Promise.all([
    fs.readFile(path.join(rootDir, 'config/possibility-civilization-program.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(rootDir, 'config/moonshot-reality-canaries.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(rootDir, 'config/moonshot-reality-program-registry.json'), 'utf8').then(JSON.parse)
  ]);
  return inspectMoonshotRealityProgram({ program, canaries, registry });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await runMoonshotRealityDoctor({});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
