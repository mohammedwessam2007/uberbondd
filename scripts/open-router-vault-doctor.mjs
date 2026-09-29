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
  'open router/EXACT_CONTENT_RECEIPT_V4_2026-09-29.json',
  'open router/13_FRONTIER_INTELLIGENCE_VIRTUAL_MACHINE.md',
  'open router/14_COGNITIVE_COMPILER_SPEC.json',
  'open router/14_COGNITIVE_SUPERCOMPILER_AND_CAPITAL_FLYWHEEL.md',
  'open router/15_NOVELTY_BOUNDARY_AND_UPGRADE_CEILING.md',
  'open router/16_PRIOR_ART_MATRIX_AND_RESEARCH_HYPOTHESIS.md',
  'open router/17_LONGITUDINAL_FRONTIER_VM_EXPERIMENT.md',
  'open router/V5_FRONTIER_VM_RECEIPT_2026-09-29.json',
  'open router/V5_POLICY_RECONCILIATION_RECEIPT_2026-09-29.json',
  'open router/LIVE_MODEL_MARKET_SNAPSHOT_2026-09-29.json',
  'open router/18_MILLION_DOLLAR_INTELLIGENCE_TARGET.md',
  'open router/19_MILLION_DOLLAR_INTELLIGENCE_INVENTION_LAB.md',
  'docs/receipts/WESSAM_SINGULARITY_ACTIVATION_WAR_ROOM_2026-09-29.json',
  'docs/experiments/FRONTIER_VM_FRESH_TASK_CUSTODIAN_2026-09-29.md',
  'src/frontier-intelligence-vm.mjs',
  'tests/frontier-intelligence-vm.test.mjs',
  'src/frontier-vm-longitudinal-evaluator.mjs',
  'tests/frontier-vm-longitudinal-evaluator.test.mjs',
  'config/frontier-vm-v5-longitudinal-campaign.json',
  'scripts/frontier-vm-v5-doctor.mjs',
  'src/cognitive-superoptimizer.mjs'
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
const liveQualityLock = readJson('config/absolute-frontier-quality-lock.json');

if (spec) {
  if (spec?.objective?.maxQualityDelta !== 0) failures.push('v3-quality-delta-not-zero');
  if (spec?.budget?.monthlyAllInTarget !== 30) failures.push('v3-monthly-budget-not-30');
  if (spec?.cockpit?.ui !== 'TypingMind') failures.push('typingmind-not-cockpit');
  if (spec?.market?.primaryTransport !== 'OpenRouter') failures.push('openrouter-not-primary-transport');
  if (spec?.jev?.initialAuthority !== 'SHADOW_ONLY') failures.push('jev-not-shadow-first');
  if (spec?.swarm?.majorityVoteAuthority !== 'NONE') failures.push('majority-vote-authority-present');
}

if (canon) {
  if (canon?.schemaVersion !== 'uberbond.open-router.frontier-max.v5') failures.push('machine-canon-not-v5');
  if (canon?.qualityLaw?.maxIntentionalDelta !== 0) failures.push('canon-quality-delta-not-zero');
  if (canon?.founderIntent?.acceptedMonthlyTargetUsd !== 30) failures.push('canon-monthly-budget-not-30');
  if (!Array.isArray(canon?.newV3Upgrades) || !canon.newV3Upgrades.includes('Cognitive Multicast')) failures.push('v3-not-linked-from-machine-canon');
  if (canon?.frontierIntelligenceVirtualization?.implementation !== 'src/frontier-intelligence-vm.mjs') failures.push('v5-frontier-vm-not-linked-from-machine-canon');
  if (!Array.isArray(canon?.frontierIntelligenceVirtualization?.qualityTypeSystem) || !canon.frontierIntelligenceVirtualization.qualityTypeSystem.includes('Q_UNKNOWN')) failures.push('v5-quality-type-system-missing');
  if (canon?.frontierIntelligenceVirtualization?.activationBoundary?.defaultMode !== 'TYPINGMIND_EXTERNAL_COCKPIT') failures.push('v5-typingmind-not-default-activation-mode');
  if (canon?.frontierIntelligenceVirtualization?.activationBoundary?.repoRuntimeOpenRouterSecretRequired !== false) failures.push('v5-typingmind-illegally-requires-repo-secret');
}

if (lock) {
  if (lock.qualityDelta !== 0) failures.push('quality-lock-snapshot-delta-not-zero');
  if (lock.degradedCouncilAllowed !== false) failures.push('quality-lock-snapshot-degraded-council-allowed');
}

if (liveQualityLock) {
  if (liveQualityLock.qualityDelta !== 0) failures.push('live-quality-lock-delta-not-zero');
  if (liveQualityLock.degradedCouncilAllowed !== false) failures.push('live-quality-lock-degraded-council-allowed');
  for (const surface of [
    'src/frontier-intelligence-vm.mjs',
    'src/cognitive-superoptimizer.mjs',
    'src/frontier-vm-longitudinal-evaluator.mjs',
    'src/frontier-vm-burnin.mjs',
    'src/frontier-vm-activation-readiness.mjs',
    'config/ubermind-cloud-cognition-resources.json',
    'scripts/ubermind-cloud-market-doctor.mjs'
  ]) {
    if (!liveQualityLock.protectedSurfaces?.includes(surface)) failures.push(`live-quality-lock-missing-protected-surface:${surface}`);
  }
  for (const law of [
    'COGNITIVE_BACKEND_AUTHORITY_MUST_MEET_OR_EXCEED_REQUIRED_QUALITY_TYPE',
    'COGNITIVE_SUPEROPTIMIZER_CANNOT_SELF_PROMOTE',
    'BURNIN_PROMOTION_REQUIRES_CANONICAL_UNTAMPERED_ZERO_LOSS_CERTIFICATE',
    'V5_ACTIVATION_REQUIRES_30_USD_MONTHLY_TARGET_AND_AT_LEAST_15_USD_PROTECTED_CROWN_ESCROW',
    'V5_ACTIVATION_READINESS_NEVER_GRANTS_SPEND_OR_PROMOTION_AUTHORITY',
    'V5_TYPINGMIND_MODE_REQUIRES_CONNECTION_EVIDENCE_BUT_NOT_REPOSITORY_RUNTIME_SECRET'
  ]) {
    if (!liveQualityLock.laws?.includes(law)) failures.push(`live-quality-lock-missing-law:${law}`);
  }
}

if (manifest) {
  const listed = new Set((manifest.files || []).map(row => row.path));
  for (const path of REQUIRED.filter(path => path.startsWith('open router/') && !['open router/MANIFEST.json','open router/BACKUP_RECEIPT_2026-09-29.json'].includes(path))) {
    if (!listed.has(path)) failures.push(`manifest-missing:${path}`);
  }
}

if (handoff?.openRouterFrontierMaxFolder20260929?.canonicalFolder !== 'open router/') failures.push('handoff-pointer-missing');
if (manifest?.status !== 'V5_FRONTIER_INTELLIGENCE_VIRTUALIZATION_CONTENT_COMPLETE') failures.push('manifest-not-v5-complete');
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

const v5Receipt = readJson('open router/V5_FRONTIER_VM_RECEIPT_2026-09-29.json');
const v5PolicyReceipt = readJson('open router/V5_POLICY_RECONCILIATION_RECEIPT_2026-09-29.json');
const liveMarket = readJson('open router/LIVE_MODEL_MARKET_SNAPSHOT_2026-09-29.json');
const warRoom = readJson('docs/receipts/WESSAM_SINGULARITY_ACTIVATION_WAR_ROOM_2026-09-29.json');
if (v5Receipt) {
  if (v5Receipt?.status !== 'OPEN_ROUTER_V5_FRONTIER_VM_PRESERVED') failures.push('v5-receipt-not-complete');
  if (v5Receipt?.qualityLaw?.maxIntentionalDelta !== 0) failures.push('v5-quality-delta-not-zero');
}
const inventionLab = fs.existsSync(path.join(root, 'open router/19_MILLION_DOLLAR_INTELLIGENCE_INVENTION_LAB.md'))
  ? fs.readFileSync(path.join(root, 'open router/19_MILLION_DOLLAR_INTELLIGENCE_INVENTION_LAB.md'), 'utf8')
  : null;

const millionDollarTarget = fs.existsSync(path.join(root, 'open router/18_MILLION_DOLLAR_INTELLIGENCE_TARGET.md'))
  ? fs.readFileSync(path.join(root, 'open router/18_MILLION_DOLLAR_INTELLIGENCE_TARGET.md'), 'utf8')
  : null;

if (inventionLab) {
  if (!inventionLab.includes('Verified Semantic Hashing')) failures.push('invention-lab-vsh-missing');
  if (!inventionLab.includes('Verifier Foundry')) failures.push('invention-lab-verifier-foundry-missing');
  if (!inventionLab.includes('Never multiply isolated paper savings')) failures.push('invention-lab-anti-fantasy-law-missing');
}

if (millionDollarTarget) {
  if (!millionDollarTarget.includes('33,333.333')) failures.push('million-dollar-target-compression-factor-missing');
  if (!millionDollarTarget.includes('paired required-quality regression = 0')) failures.push('million-dollar-target-zero-regression-law-missing');
  if (!millionDollarTarget.includes('Raw-compute equivalence is a separate claim')) failures.push('million-dollar-target-raw-compute-boundary-missing');
}

if (liveMarket) {
  if (liveMarket?.status !== 'PUBLIC_MARKET_CANDIDATE_SNAPSHOT__NO_CROWN_PROMOTION__ZERO_SPEND') failures.push('live-market-snapshot-status-invalid');
  if (liveMarket?.promotionBoundary?.currentCrownPromoted !== false) failures.push('live-market-snapshot-illegally-promotes-crown');
  if (liveMarket?.activationState?.providerCallsPerformedByThisRefresh !== 0) failures.push('live-market-refresh-provider-call-count-not-zero');
  if (liveMarket?.activationState?.spendUsd !== 0) failures.push('live-market-refresh-spend-not-zero');
  if (liveMarket?.activationState?.freshTaskCustodianRef !== 'docs/experiments/FRONTIER_VM_FRESH_TASK_CUSTODIAN_2026-09-29.md') failures.push('live-market-fresh-task-custodian-pointer-invalid');
}
if (warRoom) {
  if (warRoom?.activationState?.liveTaskClassCrownPromotion !== 'NOT_PROMOTED') failures.push('war-room-illegally-promotes-crown');
  if (warRoom?.activationState?.paidProviderCallsObservedForV5Campaign !== 0) failures.push('war-room-provider-call-count-not-zero');
}

if (v5PolicyReceipt) {
  if (v5PolicyReceipt?.status !== 'V5_TYPINGMIND_POLICY_RECONCILED_SOURCE_ONLY') failures.push('v5-policy-receipt-status-invalid');
  if (v5PolicyReceipt?.policy?.monthlyAllInTargetUsd !== 30) failures.push('v5-policy-budget-not-30');
  if (v5PolicyReceipt?.policy?.protectedCrownEscrowUsd < 15) failures.push('v5-policy-crown-escrow-below-15');
  if (v5PolicyReceipt?.policy?.maxIntentionalDelta !== 0) failures.push('v5-policy-quality-delta-not-zero');
  if (v5PolicyReceipt?.policy?.pairedTaskRegressionAllowed !== 0) failures.push('v5-policy-paired-regression-not-zero');
  if (v5PolicyReceipt?.policy?.automaticSpendAuthority !== false) failures.push('v5-policy-auto-spend-must-be-false');
}

const readme = fs.existsSync('open router/README.md') ? fs.readFileSync('open router/README.md', 'utf8') : '';
for (const token of [
  'Cognitive Multicast',
  'Crown-call coalescing',
  'Common Semantic Subexpression Elimination',
  'Decision-DAG',
  'Crown Thought Capital Ledger',
  'Negative Knowledge Cache',
  'V5 frontier intelligence virtualization',
  'COMPILE THE COGNITION',
  'VIRTUALIZE THE FRONTIER'
]) {
  if (!readme.includes(token)) failures.push(`readme-v3-token-missing:${token}`);
}

console.log(JSON.stringify({
  ok: failures.length === 0,
  status: failures.length ? 'OPEN_ROUTER_VAULT_BROKEN' : 'OPEN_ROUTER_V5_FRONTIER_VM_VAULT_COMPLETE_AND_RECOVERABLE',
  failures,
  qualityDelta: spec?.objective?.maxQualityDelta ?? null,
  monthlyBudgetUsd: spec?.budget?.monthlyAllInTarget ?? null,
  cockpit: spec?.cockpit?.ui ?? null,
  market: spec?.market?.primaryTransport ?? null,
  v3UpgradeCount: canon?.newV3Upgrades?.length ?? 0,
  v4ExactReceipt: exactV4?.status ?? null,
  v4IndexedFileCountBeforeReceipt: exactV4?.indexedFileCountBeforeReceipt ?? null,
  v5FrontierVm: v5Receipt?.status ?? null,
  v5PolicyReconciliation: v5PolicyReceipt?.status ?? null,
  liveModelMarketSnapshot: liveMarket?.status ?? null,
  millionDollarIntelligenceTarget: millionDollarTarget ? 'FOUNDER_APPROVED_RESEARCH_TARGET_NOT_PROVEN' : null,
  millionDollarInventionLab: inventionLab ? 'RESEARCH_INVENTION_PROGRAM_NOT_PROVEN' : null,
  wessamSingularityWarRoom: warRoom?.schemaVersion ?? null
}, null, 2));

if (failures.length) process.exitCode = 1;
