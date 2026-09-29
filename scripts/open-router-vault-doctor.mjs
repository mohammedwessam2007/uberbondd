import fs from 'node:fs';

const REQUIRED = [
  'open router/README.md',
  'open router/MANIFEST.json',
  'open router/OPERATING_SPEC.json',
  'open router/CANON_SNAPSHOT_2026-09-29.json',
  'open router/ARCHITECTURE.md',
  'open router/JEV_HYPERREFLEX.md',
  'open router/ECONOMICS_AND_SCOREBOARD.md',
  'open router/TYPINGMIND_AND_24_7.md',
  'open router/ACTIVATION_CHECKLIST.md',
  'open router/TYPINGMIND_PROMPT_PACK.md',
  'open router/EMPIRICAL_PROOF_PROTOCOL.md',
  'open router/SOURCE_SNAPSHOT_CLOUD_MODEL_MARKET_2026-09-29.md',
  'open router/SOURCE_SNAPSHOT_APEX_JEV_2026-09-29.md',
  'open router/SOURCE_SNAPSHOT_ABSOLUTE_QUALITY_LOCK_2026-09-29.json'
];

const failures = [];
for (const path of REQUIRED) {
  if (!fs.existsSync(path)) failures.push(`missing:${path}`);
}

function readJson(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch (error) {
    failures.push(`invalid-json:${path}:${error.message}`);
    return null;
  }
}

const spec = readJson('open router/OPERATING_SPEC.json');
const manifest = readJson('open router/MANIFEST.json');
const lockSnapshot = readJson('open router/SOURCE_SNAPSHOT_ABSOLUTE_QUALITY_LOCK_2026-09-29.json');
const handoff = readJson('docs/CURRENT_HANDOFF.json');

if (spec) {
  if (spec?.objective?.maxQualityDelta !== 0) failures.push('operating-spec-quality-delta-not-zero');
  if (spec?.budget?.monthlyAllInTarget !== 30) failures.push('operating-spec-monthly-budget-not-30');
  if (spec?.cockpit?.ui !== 'TypingMind') failures.push('operating-spec-typingmind-not-cockpit');
  if (spec?.market?.primaryTransport !== 'OpenRouter') failures.push('operating-spec-openrouter-not-primary-transport');
  if (spec?.jev?.initialAuthority !== 'SHADOW_ONLY') failures.push('operating-spec-jev-not-shadow-first');
  if (spec?.swarm?.majorityVoteAuthority !== 'NONE') failures.push('operating-spec-majority-vote-authority-present');
}

if (manifest) {
  const listed = new Set((manifest.files || []).map(row => row.path));
  for (const path of REQUIRED.filter(path => path !== 'open router/MANIFEST.json')) {
    if (!listed.has(path)) failures.push(`manifest-missing-entry:${path}`);
  }
  if (manifest.noAmputation !== true) failures.push('manifest-no-amputation-not-true');
}

if (lockSnapshot) {
  if (lockSnapshot.qualityDelta !== 0) failures.push('quality-lock-snapshot-delta-not-zero');
  if (lockSnapshot.degradedCouncilAllowed !== false) failures.push('quality-lock-snapshot-degraded-council-allowed');
}

if (handoff) {
  if (handoff?.openRouterVault20260929?.folder !== 'open router/') failures.push('current-handoff-open-router-pointer-missing');
}

const readme = fs.existsSync('open router/README.md') ? fs.readFileSync('open router/README.md', 'utf8') : '';
for (const token of [
  'QUALITY_NEVER_PAYS_FOR_COST_SAVINGS',
  'Cognitive Multicast',
  'Crown Thought Capital Ledger',
  'Negative Knowledge Cache',
  'Decision-DAG',
  'TypingMind',
  'OpenRouter',
  'Jev Hyperreflex'
]) {
  if (!readme.includes(token)) failures.push(`readme-missing-invariant:${token}`);
}

const ok = failures.length === 0;
console.log(JSON.stringify({
  ok,
  status: ok ? 'OPEN_ROUTER_VAULT_INTACT' : 'OPEN_ROUTER_VAULT_BROKEN',
  requiredFiles: REQUIRED.length,
  failures,
  qualityDelta: spec?.objective?.maxQualityDelta ?? null,
  monthlyBudgetUsd: spec?.budget?.monthlyAllInTarget ?? null,
  cockpit: spec?.cockpit?.ui ?? null,
  market: spec?.market?.primaryTransport ?? null,
  jevInitialAuthority: spec?.jev?.initialAuthority ?? null
}, null, 2));

if (!ok) process.exitCode = 1;
