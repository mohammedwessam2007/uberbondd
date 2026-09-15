import fs from 'node:fs';
import fsp from 'node:fs/promises';
import readline from 'node:readline';
import { compileOutreach100kPacket } from './outreach-100k-packet-compiler.mjs';
import { materializeOutreach100kPacketCorpus } from './outreach-100k-corpus-materializer.mjs';
import { writeOutreach100kRuntimeBundle } from './outreach-100k-runtime-bundle.mjs';

export const OUTREACH_100K_ARTIFACT_PREPARER_VERSION = 'uberbond.outreach-100k-artifact-preparer.v1';
export const DEFAULT_OUTREACH_100K_CANDIDATES_PATH = '/var/lib/uberbond-control/outreach-100k-candidates.ndjson';
export const DEFAULT_OUTREACH_100K_EVIDENCE_PATH = '/var/lib/uberbond-control/outreach-100k-evidence.json';

const clean = (value, max = 4000) => String(value ?? '').trim().slice(0, max);

function fail(reasonCodes, extra = {}) {
  return Object.freeze({
    ok: false,
    status: 'OUTREACH_100K_ARTIFACT_PREPARATION_REFUSED',
    version: OUTREACH_100K_ARTIFACT_PREPARER_VERSION,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    messagesSent: 0,
    providerCalls: 0,
    externalEffectsAuthorized: false,
    ...extra
  });
}

async function readJsonFile(filePath, maxBytes = 50 * 1024 * 1024) {
  const target = clean(filePath);
  let stat;
  try { stat = await fsp.lstat(target); } catch { return fail(['evidence-file-required']); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > maxBytes) return fail(['evidence-file-bounded-regular-file-required']);
  try {
    const raw = await fsp.readFile(target, 'utf8');
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(['evidence-file-object-required']);
    return { ok: true, value };
  } catch {
    return fail(['evidence-file-valid-json-required']);
  }
}

async function compileCandidateFile({ filePath, target, now }) {
  const source = clean(filePath);
  let stat;
  try { stat = await fsp.lstat(source); } catch { return fail(['candidate-file-required']); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 2_000_000_000) return fail(['candidate-file-bounded-regular-file-required']);
  const packets = [];
  const rejected = [];
  let lineNumber = 0;
  const stream = fs.createReadStream(source);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    lineNumber += 1;
    let record;
    try { record = JSON.parse(line); }
    catch { rejected.push({ lineNumber, reasonCodes: ['valid-json-required'] }); continue; }
    const compiled = compileOutreach100kPacket(record, { now });
    if (!compiled.ok) {
      rejected.push({ lineNumber, reasonCodes: compiled.reasonCodes, recipientId: compiled.recipientId || null, recipientEmail: compiled.recipientEmail || null });
      continue;
    }
    packets.push(compiled.packet);
    if (packets.length >= target) break;
  }
  if (packets.length < target) return fail(['insufficient-precleared-candidate-inventory'], { target, compiledCount: packets.length, rejectedCount: rejected.length, rejectedPreview: rejected.slice(0, 100) });
  return { ok: true, packets, rejectedCount: rejected.length, rejectedPreview: rejected.slice(0, 100) };
}

export async function prepareOutreach100kArtifacts({
  candidatesPath = process.env.OUTREACH_100K_CANDIDATES_PATH || DEFAULT_OUTREACH_100K_CANDIDATES_PATH,
  evidencePath = process.env.OUTREACH_100K_EVIDENCE_PATH || DEFAULT_OUTREACH_100K_EVIDENCE_PATH,
  corpusPath,
  bundlePath,
  target = 100_000,
  now = new Date()
} = {}) {
  const targetCount = Number.isFinite(Number(target)) ? Math.floor(Number(target)) : 0;
  if (targetCount < 1 || targetCount > 100_000) return fail(['target-must-be-positive-and-at-most-100000']);
  const evidenceRead = await readJsonFile(evidencePath);
  if (!evidenceRead.ok) return evidenceRead;
  const evidence = evidenceRead.value;
  const campaignId = clean(evidence?.campaign?.id || evidence?.campaignAuthorization?.campaignId, 240);
  if (!campaignId) return fail(['campaign-id-required']);

  const candidates = await compileCandidateFile({ filePath: candidatesPath, target: targetCount, now });
  if (!candidates.ok) return candidates;

  const destinationCorpus = clean(corpusPath || evidence.corpusPath || '/var/lib/uberbond-control/outreach-100k-corpus.ndjson');
  const materialized = await materializeOutreach100kPacketCorpus({
    candidates: candidates.packets,
    mailboxes: evidence.mailboxes,
    campaignId,
    outputPath: destinationCorpus,
    target: targetCount,
    now,
    businessHourStart: Number(evidence?.policy?.businessHourStart ?? 9),
    businessHourEnd: Number(evidence?.policy?.businessHourEnd ?? 17)
  });
  if (!materialized.ok) return fail(['corpus-materialization-failed', ...(materialized.reasonCodes || [])], { materialized });

  const destinationBundle = clean(bundlePath || evidence.bundlePath || '/var/lib/uberbond-control/outreach-100k-runtime-bundle.json');
  const bundle = await writeOutreach100kRuntimeBundle({
    outputPath: destinationBundle,
    ...evidence,
    recipientSetDigest: materialized.recipientSetDigest
  }, { now, maxEvidenceAgeHours: Number(evidence?.policy?.maxEvidenceAgeHours ?? 24) });
  if (!bundle.ok) return fail(['runtime-bundle-compilation-failed', ...(bundle.reasonCodes || [])], { bundle });

  return Object.freeze({
    ok: true,
    status: 'OUTREACH_100K_ARTIFACTS_PREPARED',
    version: OUTREACH_100K_ARTIFACT_PREPARER_VERSION,
    target: targetCount,
    corpusPath: destinationCorpus,
    bundlePath: destinationBundle,
    recipientSetDigest: materialized.recipientSetDigest,
    compiledCandidateCount: candidates.packets.length,
    rejectedCandidateCount: candidates.rejectedCount,
    bundleDigest: bundle.bundleDigest,
    messagesSent: 0,
    providerCalls: 0,
    externalEffectsAuthorized: false,
    truthBoundary: 'PREPARED means caller-supplied evidence and precleared candidates were compiled into the exact governed corpus and runtime bundle artifacts consumed by the certified 100K runtime. It creates no new legal eligibility, recipient permission, infrastructure capacity, provider tolerance, or send authority.'
  });
}
