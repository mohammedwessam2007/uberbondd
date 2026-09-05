import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { compileUberBondCognitiveGraph } from './uberbond-cognitive-graph.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERBOND_FEATURE_GENOME_SCHEMA = 'uberbond.feature-genome.v1';
export const UBERBOND_FEATURE_GENOME_POLICY_VERSION = 'uberbond-feature-genome-1.1.0';

const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.vercel', 'coverage', 'dist', 'build']);
const CODE_EXTENSIONS = new Set(['.mjs', '.js', '.cjs']);

export const FEATURE_FAMILIES = Object.freeze([
  { id: 'sovereignty-governance', organs: ['omnia', 'max-council'], tokens: ['omnia', 'constitution', 'constitutional', 'policy', 'authority', 'approval', 'consequence', 'cedar', 'admission', 'permission', 'governance'] },
  { id: 'truth-evidence', organs: ['truth-evidence', 'genesis-scientist'], tokens: ['truth', 'evidence', 'receipt', 'provenance', 'reconcil', 'audit', 'causal', 'witness', 'attestation', 'proof'] },
  { id: 'autonomy-agent-mesh', organs: ['agent-mesh', 'context-spine'], tokens: ['agent-autonomy', 'agent-mesh', 'mesh-', 'scheduler', 'scheduled-run', 'occurrence', 'mission-seed', 'relay', 'worker'] },
  { id: 'context-memory', organs: ['context-spine', 'world-brain', 'economic-memory'], tokens: ['context', 'memory', 'brain', 'compression', 'checkpoint', 'resume', 'knowledge'] },
  { id: 'frontier-intelligence', organs: ['gamechanger', 'genesis', 'genesis-evolution', 'genesis-scientist', 'genesis-ontology', 'genesis-metabolism'], tokens: ['gamechanger', 'genesis', 'frontier', 'unknown-unknown', 'ontology', 'ontogenesis', 'scientist', 'evolution', 'metabolism', 'counterfactual', 'serendipity', 'red-queen'] },
  { id: 'business-opportunity-economics', organs: ['business-genome', 'idea-generator', 'opportunity-factory', 'event-horizon', 'economic-memory'], tokens: ['event-horizon', 'opportun', 'business-genome', 'mechanism', 'money-model', 'commercial', 'offer', 'pricing', 'first-cash', 'revenue', 'profit', 'econom', 'sku', 'canary'] },
  { id: 'capability-market', organs: ['capability-genome', 'saas-cannibal'], tokens: ['capability-genome', 'external-capability', 'skill', 'plugin', 'capability-', 'supplier', 'assimilat', 'harvest'] },
  { id: 'model-intelligence', organs: ['open-model-universe', 'avengers', 'max-council'], tokens: ['model-', 'open-model', 'avengers', 'executor', 'anthropic', 'openai', 'ai-gateway', 'claude', 'inference', 'reasoning'] },
  { id: 'compute-sovereignty', organs: ['open-model-universe', 'avengers', 'world-brain', 'economic-memory'], tokens: ['compute-sovereignty', 'ai-compute', 'compute-budget', 'token-budget', 'inference-budget', 'prompt-cache', 'context-cache', 'free-tier', 'sponsored-grant', 'purchased-credit', 'batch-inference', 'off-peak'] },
  { id: 'adversarial-problem-solving', organs: ['max-council', 'wallbreaker', 'genesis-scientist'], tokens: ['wallbreaker', 'council', 'adversar', 'mutation-war', 'verifier', 'falsif', 'hostile', 'contradiction', 'failure-class'] },
  { id: 'world-sensing-research', organs: ['world-sensing', 'gamechanger'], tokens: ['browser', 'crawl', 'search', 'public-evidence', 'discovery', 'market-signal', 'source-', 'research', 'scrap', 'web-', 'website'] },
  { id: 'distribution-leads-outreach', organs: ['distribution-os'], tokens: ['lead', 'prospect', 'outreach', 'email', 'gmail', 'mail', 'sender', 'campaign', 'crm', 'booking', 'channel', 'referral', 'partner', 'inbound', 'unsubscribe', 'deliverability'] },
  { id: 'payment-accounting', organs: ['payment-reconciliation'], tokens: ['payment', 'paypal', 'invoice', 'ledger', 'accounting', 'refund', 'dispute', 'billing', 'checkout', 'money-movement'] },
  { id: 'fulfilment-delivery-acceptance', organs: ['fulfilment-qa'], tokens: ['fulfil', 'fulfill', 'delivery', 'acceptance', 'accept-', 'qa-', 'report', 'evidence-pack', 'service-bundle'] },
  { id: 'retention-renewal-learning', organs: ['retention-learning', 'economic-memory'], tokens: ['retention', 'renewal', 'expansion', 'churn', 'repeat-payment', 'lifetime-value'] },
  { id: 'runtime-data-infrastructure', organs: ['world-brain', 'omnia'], tokens: ['postgres', 'store', 'queue', 'migration', 'runtime', 'server', 'vercel', 'deployment', 'storage', 'cache', 'database', 'worker', 'object-storage'] },
  { id: 'resilience-observability', organs: ['world-brain', 'wallbreaker', 'kilimanjaro'], tokens: ['recovery', 'retry', 'idempoten', 'dead-letter', 'health', 'observab', 'quarantine', 'watchdog', 'heartbeat', 'crash', 'restart', 'resilien', 'failure'] },
  { id: 'security-sandbox-egress', organs: ['omnia', 'truth-evidence'], tokens: ['security', 'secret', 'redact', 'sandbox', 'egress', 'isolation', 'attack', 'penetration', 'scope', 'oauth', 'token-envelope'] },
  { id: 'interfaces-api-ui', organs: ['world-brain', 'distribution-os'], tokens: ['api/', 'api-', 'route', 'ui-', 'visual', 'dashboard', 'webhook', 'endpoint', 'http-'] },
  { id: 'founder-freedom-owner-control', organs: ['kilimanjaro', 'omnia', 'economic-memory'], tokens: ['founder', 'absence', 'owner', 'escalation', 'approval', 'human-action', 'freedom'] },
  { id: 'general-runtime', organs: ['world-brain', 'context-spine'], tokens: [] }
]);

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function normalizeRel(value) { return String(value || '').replaceAll('\\', '/').replace(/^\.\//, ''); }
function fileKind(relativePath) {
  const p = normalizeRel(relativePath);
  if (p.startsWith('src/')) return 'SOURCE_MODULE';
  if (p.startsWith('scripts/')) return 'OPERATOR_SCRIPT';
  if (p.startsWith('api/')) return 'API_ENTRYPOINT';
  if (p.startsWith('.github/workflows/')) return 'WORKFLOW';
  if (p.includes('/skills/') || p.startsWith('.claude/skills/') || p.startsWith('.codex/skills/')) return 'SKILL';
  if (p.startsWith('config/')) return 'CONFIG';
  if (p.startsWith('artifacts/')) return 'EVIDENCE_OR_GENERATED_ARTIFACT';
  if (p.startsWith('docs/')) return 'CANON_OR_MEMORY';
  if (p.startsWith('agent/') || p.startsWith('lite/')) return 'RUNTIME_SURFACE';
  if (p.startsWith('tests/')) return 'TEST';
  return 'REPOSITORY_ARTIFACT';
}

function walk(root, current = root, out = []) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) walk(root, absolute, out);
    else if (entry.isFile()) out.push(normalizeRel(path.relative(root, absolute)));
  }
  return out;
}

export function classifyFeaturePath(relativePath) {
  const normalized = normalizeRel(relativePath).toLowerCase();
  const stem = normalized.replace(/[^a-z0-9]+/g, '-');
  const matches = [];
  for (const family of FEATURE_FAMILIES.filter(item => item.id !== 'general-runtime')) {
    const score = family.tokens.reduce((sum, token) => sum + (normalized.includes(token) || stem.includes(token.replace(/[^a-z0-9]+/g, '-')) ? 1 : 0), 0);
    if (score > 0) matches.push({ id: family.id, score, organs: family.organs });
  }
  matches.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (!matches.length) return {
    primaryFamily: 'general-runtime',
    families: ['general-runtime'],
    organs: [...FEATURE_FAMILIES.find(item => item.id === 'general-runtime').organs],
    confidence: 'FALLBACK_REQUIRES_SEMANTIC_REVIEW'
  };
  const topScore = matches[0].score;
  const selected = matches.filter(item => item.score >= Math.max(1, topScore - 1)).slice(0, 4);
  return {
    primaryFamily: selected[0].id,
    families: selected.map(item => item.id),
    organs: [...new Set(selected.flatMap(item => item.organs))],
    confidence: topScore >= 2 ? 'HIGH_FILENAME_SIGNAL' : 'LOW_FILENAME_SIGNAL'
  };
}

function resolveImportTarget(fromPath, specifier, fileSet) {
  if (!specifier?.startsWith('.')) return null;
  const base = normalizeRel(path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier)));
  const candidates = [base, `${base}.mjs`, `${base}.js`, `${base}.cjs`, `${base}/index.mjs`, `${base}/index.js`];
  return candidates.find(candidate => fileSet.has(candidate)) || null;
}

export function deriveModuleEdgesFromText(fromPath, sourceText, fileSet) {
  if (!CODE_EXTENSIONS.has(path.extname(fromPath).toLowerCase()) || typeof sourceText !== 'string') return [];
  const specs = new Set();
  const staticRe = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [staticRe, dynamicRe]) {
    let match;
    while ((match = re.exec(sourceText))) specs.add(match[1]);
  }
  return [...specs].map(specifier => ({
    from: fromPath,
    to: resolveImportTarget(fromPath, specifier, fileSet),
    specifier
  })).filter(edge => edge.to);
}

function safeJson(root, relativePath) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8')); } catch { return null; }
}
function collectStringLeaves(value, prefix = '', out = [], limit = 5000) {
  if (out.length >= limit) return out;
  if (typeof value === 'string') { out.push({ path: prefix, value: value.slice(0, 2000) }); return out; }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStringLeaves(item, `${prefix}[${index}]`, out, limit));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) collectStringLeaves(child, prefix ? `${prefix}.${key}` : key, out, limit);
  }
  return out;
}

export function buildUberBondFeatureGenome({ root = process.cwd(), sourceRevision = process.env.GITHUB_SHA || null } = {}) {
  const graph = compileUberBondCognitiveGraph();
  if (!graph.ok) return { ok: false, status: 'FEATURE_GENOME_BLOCKED', reasonCodes: ['cognitive-graph-required'], businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
  const organIds = new Set(graph.nodes.map(node => node.id));
  const files = walk(root).sort();
  const fileSet = new Set(files);
  const artifactNodes = [];
  const dependencyEdges = [];
  const fallbackArtifacts = [];

  for (const relativePath of files) {
    const classification = classifyFeaturePath(relativePath);
    const unknownOrgans = classification.organs.filter(id => !organIds.has(id));
    if (unknownOrgans.length) return { ok: false, status: 'FEATURE_GENOME_BLOCKED', reasonCodes: unknownOrgans.map(id => `unknown-cognitive-organ:${id}`), businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
    const node = {
      id: `artifact:${relativePath}`,
      path: relativePath,
      kind: fileKind(relativePath),
      primaryFamily: classification.primaryFamily,
      families: classification.families,
      organs: classification.organs,
      classificationConfidence: classification.confidence
    };
    artifactNodes.push(node);
    if (classification.primaryFamily === 'general-runtime') fallbackArtifacts.push(relativePath);
    if (CODE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) {
      let text = '';
      try { text = fs.readFileSync(path.join(root, relativePath), 'utf8'); } catch { text = ''; }
      dependencyEdges.push(...deriveModuleEdgesFromText(relativePath, text, fileSet));
    }
  }

  const packageJson = safeJson(root, 'package.json') || {};
  const packageScripts = Object.entries(packageJson.scripts || {}).map(([name, command]) => ({
    id: `operator:${name}`,
    name,
    command: String(command),
    classification: classifyFeaturePath(`${name} ${command}`)
  }));

  const readiness = safeJson(root, 'config/system-readiness-input.json');
  const readinessCapabilities = Array.isArray(readiness?.capabilities) ? readiness.capabilities.map(item => ({
    id: String(item?.id || ''),
    status: String(item?.status || 'UNKNOWN'),
    level: Number.isFinite(Number(item?.level)) ? Number(item.level) : null,
    evidence: Array.isArray(item?.evidence) ? item.evidence : [],
    tests: Array.isArray(item?.tests) ? item.tests : [],
    externalBlocker: item?.externalBlocker || null,
    nextAction: item?.nextAction || null
  })).filter(item => item.id) : [];

  const reachability = safeJson(root, 'config/reachability-classification.json');
  const reachabilityModules = Object.entries(reachability?.modules || {}).map(([modulePath, decision]) => ({ path: modulePath, ...decision }));
  const activationGates = Object.entries(reachability?.gates || {}).map(([id, gate]) => ({ id, ...gate }));

  const totalBrain = safeJson(root, 'artifacts/uberbond-total-brain.json');
  const totalBrainAtoms = collectStringLeaves(totalBrain).map(item => ({ source: 'artifacts/uberbond-total-brain.json', ...item }));

  const genesis = safeJson(root, 'artifacts/perpetual-frontier-genesis.json');
  const genesisFrontier = genesis ? {
    status: genesis.status || null,
    ideaCount: Number(genesis.ideaCount || 0),
    ideaRanges: Array.isArray(genesis.ideaRanges) ? genesis.ideaRanges : [],
    frontierMechanisms: Array.isArray(genesis.frontierMechanisms) ? genesis.frontierMechanisms : [],
    coreLoop: Array.isArray(genesis.coreLoop) ? genesis.coreLoop : [],
    firstExecutableLayerCapabilities: Array.isArray(genesis?.firstExecutableLayer?.capabilities) ? genesis.firstExecutableLayer.capabilities : []
  } : null;

  const lineage = safeJson(root, 'config/uberbond-cognitive-lineage.json');
  const donorLineages = Array.isArray(lineage?.lineages) ? lineage.lineages : [];

  const familyCounts = {};
  for (const node of artifactNodes) for (const family of node.families) familyCounts[family] = (familyCounts[family] || 0) + 1;
  const kindCounts = {};
  for (const node of artifactNodes) kindCounts[node.kind] = (kindCounts[node.kind] || 0) + 1;

  const core = {
    schemaVersion: UBERBOND_FEATURE_GENOME_SCHEMA,
    sourceRevision,
    repositoryArtifactCount: artifactNodes.length,
    sourceDependencyEdgeCount: dependencyEdges.length,
    operatorScriptCount: packageScripts.length,
    readinessCapabilityCount: readinessCapabilities.length,
    reachabilityModuleCount: reachabilityModules.length,
    activationGateCount: activationGates.length,
    totalBrainAtomCount: totalBrainAtoms.length,
    genesisIdeaCount: genesisFrontier?.ideaCount || 0,
    donorLineageCount: donorLineages.length,
    fallbackArtifactCount: fallbackArtifacts.length,
    familyCounts,
    kindCounts,
    cognitiveOrganIds: [...organIds].sort(),
    featureFamilies: FEATURE_FAMILIES,
    artifactNodes,
    dependencyEdges,
    packageScripts,
    readinessCapabilities,
    reachabilityModules,
    activationGates,
    totalBrainAtoms,
    genesisFrontier,
    donorLineages,
    fallbackArtifacts
  };
  return {
    ok: true,
    policyVersion: UBERBOND_FEATURE_GENOME_POLICY_VERSION,
    status: fallbackArtifacts.length ? 'FEATURE_GENOME_COMPLETE_WITH_SEMANTIC_REVIEW_QUEUE' : 'FEATURE_GENOME_COMPLETE',
    ...core,
    genomeDigest: digest(core),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'THE FEATURE GENOME INVENTORIES REPOSITORY SURFACES, DECLARED CAPABILITIES, CANON ATOMS, FRONTIER IDEAS AND DEPENDENCIES. FILENAME CLASSIFICATION IS ROUTING METADATA, NOT PROOF OF BEHAVIOR, REACHABILITY, COMMERCIAL VALUE OR EXTERNAL EFFECT.'
  };
}

export function validateUberBondFeatureGenome(genome) {
  const reasons = [];
  if (!genome?.ok || genome?.schemaVersion !== UBERBOND_FEATURE_GENOME_SCHEMA) reasons.push('valid-feature-genome-required');
  if (!Array.isArray(genome?.artifactNodes) || genome.artifactNodes.length !== genome.repositoryArtifactCount) reasons.push('artifact-count-mismatch');
  const ids = new Set();
  for (const artifact of genome?.artifactNodes || []) {
    if (!artifact?.id || ids.has(artifact.id)) reasons.push('unique-artifact-id-required');
    ids.add(artifact?.id);
  }
  const paths = new Set((genome?.artifactNodes || []).map(item => item.path));
  for (const edge of genome?.dependencyEdges || []) if (!paths.has(edge.from) || !paths.has(edge.to)) reasons.push('dependency-edge-endpoint-missing');
  if (!Array.isArray(genome?.readinessCapabilities) || !Array.isArray(genome?.activationGates) || !Array.isArray(genome?.donorLineages)) reasons.push('canon-evidence-surfaces-required');
  return {
    ok: reasons.length === 0,
    status: reasons.length ? 'FEATURE_GENOME_INVALID' : 'FEATURE_GENOME_INTEGRITY_PASS',
    reasonCodes: [...new Set(reasons)],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}
