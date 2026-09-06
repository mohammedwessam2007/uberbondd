import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERBOND_REPOSITORY_DEEP_ATLAS_SCHEMA = 'uberbond.repository-deep-atlas.v1';
export const UBERBOND_REPOSITORY_DEEP_ATLAS_POLICY_VERSION = 'uberbond-repository-deep-atlas-1.0.0';

const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_DETAILS_PER_FILE = 10000;
const TEXT_EXTENSIONS = new Set([
  '.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.md', '.mdx', '.yml', '.yaml',
  '.html', '.htm', '.css', '.scss', '.sql', '.sh', '.bash', '.py', '.txt', '.toml', '.ini',
  '.xml', '.csv', '.svg', '.graphql', '.gql'
]);
const TEXT_BASENAMES = new Set(['dockerfile', 'makefile', 'procfile', 'license', 'readme', '.gitignore', '.npmrc', '.nvmrc']);

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function clean(value, max = 2000) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
function normalizeRel(value) { return String(value || '').replaceAll('\\', '/').replace(/^\.\//, ''); }
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function detailId(pathname, kind, name, ordinal = 0) {
  return `deep:${digest([pathname, kind, name, ordinal]).slice(0, 28)}`;
}
function lineNumberAt(text, index) { return text.slice(0, index).split('\n').length; }
function isLikelyTextPath(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  const base = path.basename(relativePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || TEXT_BASENAMES.has(base) || base.startsWith('.env');
}
function safeText(root, relativePath) {
  try {
    const absolute = path.join(root, relativePath);
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) return { ok: false, reason: 'not-file', bytes: 0, text: '' };
    if (stat.size > MAX_TEXT_BYTES) return { ok: false, reason: 'text-file-too-large', bytes: stat.size, text: '' };
    const buffer = fs.readFileSync(absolute);
    if (buffer.includes(0)) return { ok: false, reason: 'binary-or-nul-content', bytes: buffer.length, text: '' };
    return { ok: true, reason: null, bytes: buffer.length, text: buffer.toString('utf8') };
  } catch (error) {
    return { ok: false, reason: `read-failed:${error?.code || 'unknown'}`, bytes: 0, text: '' };
  }
}
function addDetail(state, detail) {
  if (!detail?.id || state.byId.has(detail.id)) return;
  if ((state.perFileCount.get(detail.sourcePath) || 0) >= MAX_DETAILS_PER_FILE) {
    state.truncatedFiles.add(detail.sourcePath);
    return;
  }
  state.byId.set(detail.id, detail);
  state.details.push(detail);
  state.perFileCount.set(detail.sourcePath, (state.perFileCount.get(detail.sourcePath) || 0) + 1);
}
function pushMatch(state, artifact, text, kind, regex, mapper) {
  let match;
  let ordinal = 0;
  while ((match = regex.exec(text))) {
    ordinal += 1;
    const mapped = mapper(match, ordinal);
    if (!mapped?.name) continue;
    const name = clean(mapped.name, 1000);
    if (!name) continue;
    addDetail(state, {
      id: detailId(artifact.path, kind, name, ordinal),
      class: kind,
      name,
      sourcePath: artifact.path,
      line: mapped.line || lineNumberAt(text, match.index),
      organs: artifact.organs || [],
      families: artifact.families || [],
      truthClass: mapped.truthClass || 'REPOSITORY_DECLARATION',
      ...(mapped.meta || {})
    });
  }
}
function codeDetails(state, artifact, text) {
  pushMatch(state, artifact, text, 'CODE_SYMBOL', /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g, match => ({ name: `function:${match[1]}` }));
  pushMatch(state, artifact, text, 'CODE_SYMBOL', /\b(?:export\s+)?class\s+([A-Za-z_$][\w$]*)\b/g, match => ({ name: `class:${match[1]}` }));
  pushMatch(state, artifact, text, 'CODE_SYMBOL', /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g, match => ({ name: `callable:${match[1]}` }));
  pushMatch(state, artifact, text, 'TEST_CASE', /\b(?:test|it|describe)\s*\(\s*['"`]([^'"`\n]{1,500})['"`]/g, match => ({ name: match[1], truthClass: 'TEST_DECLARATION' }));
  pushMatch(state, artifact, text, 'HTTP_ROUTE', /\b(?:app|router|server)\s*\.\s*(get|post|put|patch|delete|options|head|all)\s*\(\s*['"`]([^'"`\n]{1,500})['"`]/gi, match => ({ name: `${match[1].toUpperCase()} ${match[2]}` }));
  pushMatch(state, artifact, text, 'ENVIRONMENT_BINDING', /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g, match => ({ name: match[1], truthClass: 'CONFIGURATION_REFERENCE' }));
  pushMatch(state, artifact, text, 'ENVIRONMENT_BINDING', /\bprocess\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g, match => ({ name: match[1], truthClass: 'CONFIGURATION_REFERENCE' }));
  pushMatch(state, artifact, text, 'SQL_OBJECT', /\bCREATE\s+(?:OR\s+REPLACE\s+)?(TABLE|VIEW|INDEX|SCHEMA)\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([A-Za-z_][\w.-]*)["`]?/gi, match => ({ name: `${match[1].toUpperCase()}:${match[2]}` }));
}
function markdownDetails(state, artifact, text) {
  pushMatch(state, artifact, text, 'DOCUMENT_SECTION', /^(#{1,6})\s+(.+?)\s*$/gm, match => ({ name: clean(match[2], 1000), meta: { depth: match[1].length }, truthClass: 'CANON_OR_MEMORY_SECTION' }));
  pushMatch(state, artifact, text, 'DOCUMENT_ASSERTION', /^\s*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/gm, match => ({ name: clean(match[2], 1000), meta: { checked: String(match[1]).toLowerCase() === 'x' }, truthClass: 'CHECKLIST_DECLARATION' }));
}
function htmlDetails(state, artifact, text) {
  pushMatch(state, artifact, text, 'UI_SURFACE', /\bid\s*=\s*['"]([^'"]{1,300})['"]/gi, match => ({ name: `id:${match[1]}` }));
  pushMatch(state, artifact, text, 'UI_SURFACE', /\b(?:aria-label|data-testid|name)\s*=\s*['"]([^'"]{1,300})['"]/gi, match => ({ name: `surface:${match[1]}` }));
}
function yamlDetails(state, artifact, text) {
  pushMatch(state, artifact, text, 'WORKFLOW_STEP', /^\s*-\s+name:\s*['"]?(.+?)['"]?\s*$/gm, match => ({ name: clean(match[1], 1000), truthClass: 'WORKFLOW_DECLARATION' }));
  pushMatch(state, artifact, text, 'WORKFLOW_ACTION', /^\s*uses:\s*([^\s#]+)\s*$/gm, match => ({ name: clean(match[1], 1000), truthClass: 'WORKFLOW_DECLARATION' }));
  pushMatch(state, artifact, text, 'WORKFLOW_TRIGGER', /\bcron:\s*['"]([^'"]+)['"]/g, match => ({ name: `cron:${match[1]}`, truthClass: 'WORKFLOW_DECLARATION' }));
}
function jsonDetails(state, artifact, text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return; }
  const visit = (value, pointer, depth) => {
    if ((state.perFileCount.get(artifact.path) || 0) >= MAX_DETAILS_PER_FILE) {
      state.truncatedFiles.add(artifact.path);
      return;
    }
    if (depth > 32) return;
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${pointer}/${index}`, depth + 1));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        const escaped = key.replaceAll('~', '~0').replaceAll('/', '~1');
        const next = `${pointer}/${escaped}`;
        addDetail(state, {
          id: detailId(artifact.path, 'CONFIG_KEY', next, 0),
          class: 'CONFIG_KEY',
          name: next,
          sourcePath: artifact.path,
          line: null,
          organs: artifact.organs || [],
          families: artifact.families || [],
          truthClass: 'CONFIGURATION_DECLARATION',
          valueType: Array.isArray(child) ? 'array' : child === null ? 'null' : typeof child
        });
        visit(child, next, depth + 1);
      }
    }
  };
  visit(parsed, '', 0);
}

export function buildUberBondRepositoryDeepAtlas({ root = process.cwd(), featureGenome } = {}) {
  if (!featureGenome?.ok || !Array.isArray(featureGenome?.artifactNodes) || !featureGenome?.genomeDigest) {
    return { ok: false, status: 'REPOSITORY_DEEP_ATLAS_BLOCKED', reasonCodes: ['valid-feature-genome-required'], businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
  }
  const state = { details: [], byId: new Map(), perFileCount: new Map(), truncatedFiles: new Set() };
  const coverage = [];
  for (const artifact of featureGenome.artifactNodes) {
    const relativePath = normalizeRel(artifact.path);
    if (!relativePath) continue;
    const extension = path.extname(relativePath).toLowerCase();
    if (!isLikelyTextPath(relativePath)) {
      coverage.push({ path: relativePath, status: 'ARTIFACT_ONLY_NON_TEXT_OR_UNSUPPORTED', bytes: null, detailCount: 0 });
      continue;
    }
    const loaded = safeText(root, relativePath);
    if (!loaded.ok) {
      coverage.push({ path: relativePath, status: loaded.reason, bytes: loaded.bytes, detailCount: 0 });
      continue;
    }
    const before = state.details.length;
    if (['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx'].includes(extension)) codeDetails(state, artifact, loaded.text);
    if (['.md', '.mdx'].includes(extension) || relativePath.startsWith('.claude/skills/') || relativePath.startsWith('.codex/skills/')) markdownDetails(state, artifact, loaded.text);
    if (['.html', '.htm'].includes(extension)) htmlDetails(state, artifact, loaded.text);
    if (['.yml', '.yaml'].includes(extension) || relativePath.startsWith('.github/workflows/')) yamlDetails(state, artifact, loaded.text);
    if (extension === '.json' || path.basename(relativePath) === 'package.json') jsonDetails(state, artifact, loaded.text);
    coverage.push({ path: relativePath, status: 'PARSED_TEXT', bytes: loaded.bytes, detailCount: state.details.length - before });
  }

  const classes = {};
  for (const detail of state.details) classes[detail.class] = (classes[detail.class] || 0) + 1;
  const parsedTextFiles = coverage.filter(item => item.status === 'PARSED_TEXT').length;
  const artifactOnlyFiles = coverage.length - parsedTextFiles;
  const truncatedFiles = [...state.truncatedFiles].sort();
  const core = {
    schemaVersion: UBERBOND_REPOSITORY_DEEP_ATLAS_SCHEMA,
    featureGenomeDigest: featureGenome.genomeDigest,
    repositoryArtifactCount: featureGenome.artifactNodes.length,
    coverageCount: coverage.length,
    parsedTextFileCount: parsedTextFiles,
    artifactOnlyFileCount: artifactOnlyFiles,
    deepFeatureCount: state.details.length,
    classCounts: classes,
    truncatedFiles,
    coverage,
    details: state.details
  };
  return {
    ok: coverage.length === featureGenome.artifactNodes.length && truncatedFiles.length === 0,
    policyVersion: UBERBOND_REPOSITORY_DEEP_ATLAS_POLICY_VERSION,
    status: coverage.length !== featureGenome.artifactNodes.length ? 'REPOSITORY_DEEP_ATLAS_INCOMPLETE' : truncatedFiles.length ? 'REPOSITORY_DEEP_ATLAS_TRUNCATED' : 'REPOSITORY_DEEP_ATLAS_COMPLETE',
    ...core,
    atlasDigest: digest(core),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'EVERY REPOSITORY FILE REMAINS REPRESENTED BY THE FEATURE GENOME. THE DEEP ATLAS ADDS ADDRESSABLE DECLARATIONS FROM TEXTUAL CODE, TESTS, WORKFLOWS, CONFIG, CANON, MEMORY AND UI SURFACES. REGEX OR STRUCTURAL DISCOVERY PROVES PRESENCE ONLY; IT DOES NOT PROVE REACHABILITY, CORRECTNESS, EXTERNAL TRUTH OR CONSEQUENCE AUTHORITY.'
  };
}

export function queryRepositoryDeepAtlas(atlas, { text: query = '', classes = [], sourcePaths = [], limit = 200 } = {}) {
  if (!atlas?.ok || !Array.isArray(atlas.details)) return { ok: false, status: 'REPOSITORY_DEEP_ATLAS_QUERY_BLOCKED', reasonCodes: ['valid-deep-atlas-required'] };
  const needle = clean(query, 500).toLowerCase();
  const classSet = new Set((classes || []).map(item => String(item).toUpperCase()));
  const pathSet = new Set((sourcePaths || []).map(normalizeRel));
  const cap = Number.isSafeInteger(Number(limit)) ? Math.max(1, Math.min(5000, Number(limit))) : 200;
  const matches = atlas.details.filter(detail => {
    if (classSet.size && !classSet.has(String(detail.class || '').toUpperCase())) return false;
    if (pathSet.size && !pathSet.has(detail.sourcePath)) return false;
    if (!needle) return true;
    return JSON.stringify(detail).toLowerCase().includes(needle);
  }).slice(0, cap);
  return { ok: true, status: 'REPOSITORY_DEEP_ATLAS_QUERY_COMPLETE', query: needle || null, matchCount: matches.length, matches };
}
