#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOrchestratorDiscoveryPlan } from '../src/orchestration-frontier.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith('--')) continue;
  args.set(token, process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i] ?? true);
}
const inputPath = resolve(root, String(args.get('--input') || 'artifacts/gamechanger-mesh-latest.json'));
const outputPath = resolve(root, String(args.get('--output') || 'artifacts/orchestration-frontier-candidates-latest.json'));
const dryRun = args.has('--dry-run');

function text(value, max = 6000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function orchestrationSignal(item = {}) {
  const observation = item?.observation ?? {};
  const sourceId = String(observation.sourceId ?? '').toLowerCase();
  if (sourceId === 'search-orchestration-skills-frontier') return true;
  const blob = `${observation.title ?? ''} ${observation.summary ?? ''} ${(observation.claims ?? []).join(' ')}`.toLowerCase();
  return [
    'orchestrat',
    'claude code',
    'codex',
    'gemini cli',
    'multi-agent',
    'multi agent',
    'subagent',
    'swarm',
    'planner worker',
    'task graph',
    'worktree',
    'adversarial review',
    'test-driven',
    'tdd',
    'verification skill'
  ].some(term => blob.includes(term));
}

let input;
try {
  input = JSON.parse(await readFile(inputPath, 'utf8'));
} catch (error) {
  console.error(JSON.stringify({ status: 'ORCHESTRATION_FRONTIER_INPUT_INVALID', reason: String(error?.message || error), input: inputPath }));
  process.exit(1);
}

const ranked = Array.isArray(input?.tournament?.ranked) ? input.tournament.ranked : null;
if (!ranked || ranked.length > 50000) {
  console.error(JSON.stringify({ status: 'ORCHESTRATION_FRONTIER_INPUT_INVALID', reason: 'bounded-gamechanger-ranked-list-required', input: inputPath }));
  process.exit(1);
}

const discoveryPlan = buildOrchestratorDiscoveryPlan();
const seen = new Set();
const candidates = [];
for (const item of ranked) {
  if (!item?.fingerprint || seen.has(item.fingerprint) || !orchestrationSignal(item)) continue;
  if (String(item.attentionState ?? 'IGNORE') === 'IGNORE') continue;
  const observation = item.observation ?? {};
  const source = text(observation.url, 3000);
  const title = text(observation.title, 1000);
  const summary = text(observation.summary, 6000);
  if (!source || !source.startsWith('https://') || !title || !summary) continue;
  seen.add(item.fingerprint);
  candidates.push({
    id: `orchestration:${String(item.fingerprint).slice(0, 24)}`,
    fingerprint: String(item.fingerprint),
    source,
    sourceId: text(observation.sourceId, 300),
    title,
    summary,
    observedAt: text(observation.observedAt, 100),
    gamechangerScore: Number(item.score ?? 0),
    gamechangerAttentionState: String(item.attentionState ?? 'WATCH'),
    state: 'DISCOVERED_RESEARCH_REQUIRED',
    sourceRef: null,
    license: 'UNRESOLVED',
    callableRuntimeProven: false,
    installationApproved: false,
    promotionApproved: false,
    nextStage: 'PROVENANCE_LICENSE_SECURITY_DEDUPE_AND_ORCHESTRATION_TOURNAMENT',
    requiredResearch: [
      'resolve-original-upstream-and-exact-revision',
      'resolve-license-and-attribution',
      'inspect-security-data-and-external-effect-surface',
      'dedupe-against-uberbond-agent-mesh-relay-wallbreaker-and-project-skills',
      'extract-orchestration-mechanisms',
      'score-against-current-fable-n-plus-one-baseline',
      'run-bounded-held-out-behavioral-comparison-before-promotion'
    ]
  });
}

candidates.sort((a, b) => b.gamechangerScore - a.gamechangerScore || a.fingerprint.localeCompare(b.fingerprint));
const receipt = {
  schemaVersion: 'uberbond.orchestration-frontier-candidates.v1',
  generatedAt: new Date().toISOString(),
  dryRun,
  sourceArtifact: inputPath,
  discoveryPlan,
  candidateCount: candidates.length,
  candidates: candidates.slice(0, 100),
  truthBoundary: 'DISCOVERY_OR_GAMECHANGER_SCORE_IS_NOT_LICENSE_APPROVAL_RUNTIME_CALLABILITY_INSTALLATION_PROMOTION_OR_BUSINESS_AUTHORITY',
  businessEffectAuthority: 'NONE',
  installationAuthority: 'NONE',
  promotionAuthority: 'NONE',
  externalEffectLedger: {
    providerCalls: 0,
    messages: 0,
    purchases: 0,
    deployments: 0,
    credentialChanges: 0,
    dnsChanges: 0,
    productionMutations: 0,
    spendCents: 0
  }
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: 'ORCHESTRATION_FRONTIER_CANDIDATES_READY',
  candidateCount: receipt.candidateCount,
  output: outputPath,
  installationAuthority: 'NONE',
  promotionAuthority: 'NONE'
}, null, 2));
