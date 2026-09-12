import fs from 'node:fs/promises';
import path from 'node:path';
import { adaptGamechangerReceipt } from './gamechanger-frontier-learning-adapter.mjs';
import { runFrontierLearningCycle } from './frontier-learning-runtime.mjs';

export const FRONTIER_LEARNING_JOB_HANDLER_VERSION = 'uberbond.frontier-learning-job-handler.v1';

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function runFrontierLearningJob({
  root = process.cwd(),
  inputPath = 'artifacts/gamechanger-mesh-latest.json',
  outputPath = 'artifacts/frontier-learning-latest.json',
  maxInvestigations = 8,
  now = () => new Date().toISOString(),
  readJsonImpl = readJson,
  writeJsonImpl = writeJson
} = {}) {
  const sourcePath = path.resolve(root, inputPath);
  const destinationPath = path.resolve(root, outputPath);
  const sourceReceipt = await readJsonImpl(sourcePath);
  if (!sourceReceipt) {
    return {
      ok: true,
      status: 'FRONTIER_LEARNING_NO_INPUT',
      sourcePath,
      executionAuthority: 'NONE',
      businessEffectAuthority: 'NONE'
    };
  }

  const adapted = adaptGamechangerReceipt(sourceReceipt);
  if (!adapted.ok) {
    return {
      ok: false,
      status: 'FRONTIER_LEARNING_INPUT_REFUSED',
      reasonCodes: adapted.reasons,
      sourcePath,
      executionAuthority: 'NONE',
      businessEffectAuthority: 'NONE'
    };
  }

  const cycle = runFrontierLearningCycle({
    observations: adapted.observations,
    maxInvestigations
  });
  const receipt = {
    schemaVersion: FRONTIER_LEARNING_JOB_HANDLER_VERSION,
    generatedAt: now(),
    sourcePath,
    sourceTruthBoundary: adapted.truthBoundary,
    discoveryFingerprintCount: adapted.observations.length,
    cycle,
    truthLaw: 'DISCOVERY_FINGERPRINTS_ARE_NOT_CAPABILITY_ATOMS',
    executionAuthority: 'NONE',
    businessEffectAuthority: 'NONE'
  };
  await writeJsonImpl(destinationPath, receipt);
  return {
    ok: true,
    status: 'FRONTIER_LEARNING_RECEIPT_WRITTEN',
    outputPath: destinationPath,
    receipt,
    executionAuthority: 'NONE',
    businessEffectAuthority: 'NONE'
  };
}
