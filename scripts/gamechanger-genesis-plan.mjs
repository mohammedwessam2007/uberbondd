#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileGamechangerIntoGenesis } from '../src/gamechanger-genesis-adapter.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith('--')) continue;
  const value = process.argv[i + 1];
  args.set(token, value && !value.startsWith('--') ? process.argv[++i] : true);
}

const candidatePath = args.get('--candidate') ? resolve(root, String(args.get('--candidate'))) : null;
const extractionPath = args.get('--extraction') ? resolve(root, String(args.get('--extraction'))) : null;
const peerDonorsPath = args.get('--peer-donors') ? resolve(root, String(args.get('--peer-donors'))) : null;
const outputPath = args.get('--output') ? resolve(root, String(args.get('--output'))) : null;
const maxCandidates = args.get('--max-candidates') == null ? 50 : Number(args.get('--max-candidates'));

async function readJson(path, label) {
  if (!path) throw new Error(`${label}-path-required`);
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

try {
  const [gamechangerCandidate, extractedMechanism, peerDonorsDoc] = await Promise.all([
    readJson(candidatePath, 'candidate'),
    readJson(extractionPath, 'extraction'),
    readJson(peerDonorsPath, 'peer-donors')
  ]);
  const peerDonors = Array.isArray(peerDonorsDoc) ? peerDonorsDoc : peerDonorsDoc?.donors;
  const result = compileGamechangerIntoGenesis({
    gamechangerCandidate,
    extractedMechanism,
    peerDonors,
    maxCandidates
  });
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 2;
  } else {
    if (outputPath) {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    }
    console.log(JSON.stringify({
      ok: true,
      status: result.status,
      bindingDigest: result.bindingDigest,
      donorMechanismId: result.binding?.donorMechanismId || null,
      genesisCandidateCount: Array.isArray(result.genesisCompilation?.candidates) ? result.genesisCompilation.candidates.length : 0,
      output: outputPath,
      networkCalls: 0,
      providerCalls: 0,
      businessEffectAuthority: 'NONE'
    }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    status: 'GAMECHANGER_GENESIS_PLAN_REFUSED',
    reasonCodes: [String(error?.message || error).slice(0, 300)],
    networkCalls: 0,
    providerCalls: 0,
    businessEffectAuthority: 'NONE'
  }, null, 2));
  process.exitCode = 2;
}
