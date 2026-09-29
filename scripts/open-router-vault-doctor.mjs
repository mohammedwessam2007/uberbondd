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
  'open router/BACKUP_RECEIPT_2026-09-29.json',
  'open router/FINAL_COMPLETION_RECEIPT_2026-09-29.json',
  'open router/FINAL_CHAT_DELTA_V4_2026-09-29.md',
  'open router/RECOVERY_AUDIT_V4_2026-09-29.md',
  'open router/EXACT_CONTENT_RECEIPT_V4_2026-09-29.json'
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
const backup = readJson('open router/BACKUP_RECEIPT_2026-09-29.json');
const completion = readJson('open router/FINAL_COMPLETION_RECEIPT_2026-09-29.json');
const exactV4 = readJson('open router/EXACT_CONTENT_RECEIPT_V4_2026-09-29.json');

if (spec) {
  if (spec?.objective?.maxQualityDelta !== 0) failures.push('v3-quality-delta-not-zero');
  if (spec?.budget?.monthlyAllInTarget !== 30) failures.push('v3-monthly-budget-not-30');
  if (spec?.cockpit?.ui !== 'TypingMind') failures.push('typingmind-not-cockpit');
  if (spec?.market?.primaryTransport !== 'OpenRouter') failures.push('openrouter-not-primary-transport');
  if (spec?.jev?.initialAuthority !== 'SHADOW_ONLY') failures.push('jev-not-shadow-first');
  if (spec?.swarm?.majorityVoteAuthority !== 'NONE') failures.push('majority-vote-authority-present');
}

if (canon) {
  if (canon?.schemaVersion !== 'uberbond.open-router.frontier-max.v3') failures.push('machine-canon-not-v3');
  if (canon?.qualityLaw?.maxIntentionalDelta !== 0) failures.push('canon-quality-delta-not-zero');
  if (canon?.founderIntent?.acceptedMonthlyTargetUsd !== 30) failures.push('canon-monthly-budget-not-30');
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
if (manifest?.status !== 'V2_PLUS_V3_CONTENT_COMPLETE') failures.push('manifest-not-complete');
if (backup?.status !== 'V2_PLUS_V3_BACKUP_CONTENT_COMPLETE') failures.push('backup-receipt-not-complete');
if (completion?.status !== 'OPEN_ROUTER_VAULT_COMPLETE') failures.push('final-completion-receipt-not-complete');
if (completion?.qualityLaw?.maxIntentionalDelta !== 0) failures.push('completion-quality-delta-not-zero');
if (completion?.budget?.monthlyAllInTargetUsd !== 30) failures.push('completion-budget-not-30');

if (exactV4) {
  if (exactV4?.status !== 'OPEN_ROUTER_V4_EXACT_CONTENT_RECOVERED') failures.push('v4-exact-receipt-not-complete');
  if (exactV4?.indexedFileCountBeforeReceipt !== 32) failures.push('v4-indexed-file-count-not-32');
  if (exactV4?.expectedFolderFileCountAfterReceipt !== 33) failures.push('v4-final-folder-count-not-33');
  if (exactV4?.qualityLaw?.maxIntentionalDelta !== 0) failures.push('v4-quality-delta-not-zero');
  if (exactV4?.budget?.monthlyAllInTargetUsd !== 30) failures.push('v4-budget-not-30');
}

const v4Delta = fs.existsSync('open router/FINAL_CHAT_DELTA_V4_2026-09-29.md') ? fs.readFileSync('open router/FINAL_CHAT_DELTA_V4_2026-09-29.md', 'utf8') : '';
for (const token of ['We are greedy', 'fucking insane', 'thousands of dollar worth in that 30 dollars jaw drppping', 'Continue until every letter is recovered']) {
  if (!v4Delta.includes(token)) failures.push(`v4-founder-intent-token-missing:${token}`);
}

const v4Audit = fs.existsSync('open router/RECOVERY_AUDIT_V4_2026-09-29.md') ? fs.readFileSync('open router/RECOVERY_AUDIT_V4_2026-09-29.md', 'utf8') : '';
for (const token of ['zero stale indexed entries', 'byte-consistent', 'Git blob SHA']) {
  if (!v4Audit.includes(token)) failures.push(`v4-audit-token-missing:${token}`);
}

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
  status: failures.length ? 'OPEN_ROUTER_VAULT_BROKEN' : 'OPEN_ROUTER_V4_VAULT_COMPLETE_AND_EXACTLY_RECOVERABLE',
  failures,
  qualityDelta: spec?.objective?.maxQualityDelta ?? null,
  monthlyBudgetUsd: spec?.budget?.monthlyAllInTarget ?? null,
  cockpit: spec?.cockpit?.ui ?? null,
  market: spec?.market?.primaryTransport ?? null,
  v3UpgradeCount: canon?.newV3Upgrades?.length ?? 0,
  v4ExactReceipt: exactV4?.status ?? null,
  v4IndexedFileCountBeforeReceipt: exactV4?.indexedFileCountBeforeReceipt ?? null
}, null, 2));

if (failures.length) process.exitCode = 1;
