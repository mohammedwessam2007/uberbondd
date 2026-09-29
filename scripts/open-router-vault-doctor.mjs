import fs from 'node:fs';

const REQUIRED = [
  'open router/README.md',
  'open router/OPEN_ROUTER_UBERMIND_CANON.json',
  'open router/00_FINAL_SYSTEM.md',
  'open router/07_1000X_COMPRESSION_LAB.md',
  'open router/ARCHITECTURE.md',
  'open router/JEV_HYPERREFLEX.md',
  'open router/ECONOMICS_AND_SCOREBOARD.md',
  'open router/TYPINGMIND_AND_24_7.md',
  'open router/ACTIVATION_CHECKLIST.md',
  'open router/TYPINGMIND_PROMPT_PACK.md',
  'open router/EMPIRICAL_PROOF_PROTOCOL.md',
  'open router/OPERATING_SPEC.json',
  'open router/CANON_SNAPSHOT_2026-09-29.json',
  'open router/SOURCE_SNAPSHOT_CLOUD_MODEL_MARKET_2026-09-29.md',
  'open router/SOURCE_SNAPSHOT_APEX_JEV_2026-09-29.md',
  'open router/SOURCE_SNAPSHOT_ABSOLUTE_QUALITY_LOCK_2026-09-29.json',
  'open router/MANIFEST.json',
  'open router/BACKUP_RECEIPT_2026-09-29.json'
];

const failures = [];
for (const path of REQUIRED) if (!fs.existsSync(path)) failures.push(`missing:${path}`);

function readJson(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch (error) {
    failures.push(`invalid-json:${path}:${error.message}`);
    return null;
  }
}

const spec = readJson('open router/OPERATING_SPEC.json');
const canon = readJson('open router/OPEN_ROUTER_UBERMIND_CANON.json');
const manifest = readJson('open router/MANIFEST.json');
const lock = readJson('open router/SOURCE_SNAPSHOT_ABSOLUTE_QUALITY_LOCK_2026-09-29.json');
const handoff = readJson('docs/CURRENT_HANDOFF.json');

if (spec) {
  if (spec?.objective?.maxQualityDelta !== 0) failures.push('v3-quality-delta-not-zero');
  if (spec?.budget?.monthlyAllInTarget !== 30) failures.push('v3-monthly-budget-not-30');
  if (spec?.cockpit?.ui !== 'TypingMind') failures.push('typingmind-not-cockpit');
  if (spec?.market?.primaryTransport !== 'OpenRouter') failures.push('openrouter-not-primary-transport');
  if (spec?.jev?.initialAuthority !== 'SHADOW_ONLY') failures.push('jev-not-shadow-first');
  if (spec?.swarm?.majorityVoteAuthority !== 'NONE') failures.push('majority-vote-authority-present');
}

if (canon) {
  if (canon?.qualityLaw?.maxIntentionalDelta !== 0) failures.push('v2-quality-delta-not-zero');
  if (canon?.founderIntent?.acceptedMonthlyTargetUsd !== 30) failures.push('v2-monthly-budget-not-30');
  if (!Array.isArray(canon?.newV3Upgrades) || !canon.newV3Upgrades.includes('Cognitive Multicast')) failures.push('v3-not-linked-from-machine-canon');
}

if (lock) {
  if (lock.qualityDelta !== 0) failures.push('quality-lock-snapshot-delta-not-zero');
  if (lock.degradedCouncilAllowed !== false) failures.push('quality-lock-snapshot-degraded-council-allowed');
}

if (manifest) {
  const listed = new Set((manifest.files || []).map(row => row.path));
  for (const path of REQUIRED.filter(path => !['open router/MANIFEST.json','open router/BACKUP_RECEIPT_2026-09-29.json'].includes(path))) {
    if (!listed.has(path)) failures.push(`manifest-missing:${path}`);
  }
}

if (handoff?.openRouterFrontierMaxFolder20260929?.canonicalFolder !== 'open router/') failures.push('handoff-pointer-missing');

const readme = fs.existsSync('open router/README.md') ? fs.readFileSync('open router/README.md', 'utf8') : '';
for (const token of [
  'Cognitive Multicast',
  'Crown-call coalescing',
  'Common Semantic Subexpression Elimination',
  'Decision-DAG',
  'Crown Thought Capital Ledger',
  'Negative Knowledge Cache'
]) {
  if (!readme.includes(token)) failures.push(`readme-v3-token-missing:${token}`);
}

console.log(JSON.stringify({
  ok: failures.length === 0,
  status: failures.length ? 'OPEN_ROUTER_VAULT_BROKEN' : 'OPEN_ROUTER_V2_V3_VAULT_INTACT',
  failures,
  qualityDelta: spec?.objective?.maxQualityDelta ?? null,
  monthlyBudgetUsd: spec?.budget?.monthlyAllInTarget ?? null,
  cockpit: spec?.cockpit?.ui ?? null,
  market: spec?.market?.primaryTransport ?? null,
  v3UpgradeCount: canon?.newV3Upgrades?.length ?? 0
}, null, 2));

if (failures.length) process.exitCode = 1;
