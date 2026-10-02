// Phase A forensic gap compiler for the outreach/lead-generation organ.
// Read-only: walks the real static import graph (the same one the repository
// reachability ratchet uses) and writes one machine-readable artifact. A file
// existing is never reported as production wiring; every module gets a class
// derived from real callers, never from its name or from prose.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reachableFromEntryPoints, FOUNDER_INTERACTIVE_ENTRY_POINTS } from './system-readiness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTION_ENTRY_POINTS = ['server.mjs', 'worker.mjs', 'scripts/agent-mesh-tick.mjs'];

const walk = (dir, ext = '.mjs') => {
  const out = [];
  const visit = rel => {
    let entries;
    try { entries = readdirSync(join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) visit(child); else if (e.name.endsWith(ext)) out.push(child);
    }
  };
  visit(dir);
  return out.sort();
};

export const OUTREACH_MODULE_GLOBS = [
  'uberlaunch-runtime-evidence', 'uberlaunch-one-button', 'uberlaunch-closure', 'outreach-automation', 'ubereconomics-outreach',
  'uberreply-taxonomy', 'uberreply-tournament', 'uberreply-four-offer-genome', 'uberreply-prework-artifact',
  'outreach-cold-route-policy', 'prospect-verification-intake', 'prospect-contact-history', 'prospect-message-tournament',
  'prospect-effect-package', 'prospect-preflight', 'uberwinnr-adapter', 'uberwinnr-provider-adapter', 'uberwinnr-postpurchase',
  'uberwinnr-credential-import', 'uberwinnr-procurement-frontier', 'uberwarm-reputation-lab', 'uberwarm2-registry-bridge',
  'uberwarm2-sovereign-ramp', 'uberplacement', 'uberquality-capacity-governor', 'lead-generation', 'lead-intelligence-v3',
  'uberbond-native-lead-ops', 'uberlead-launch-fusion', 'uberprospect-forge', 'uberoutbound-genome', 'uberoutbound-policy-registry',
  'uberoutbound-promotion-gate', 'uberoutbound-recipient-eligibility', 'uberoutbound-research-import', 'outreach-workbench',
  'pipeline', 'send-safety', 'outreach-governance', 'governed-outreach-dispatch', 'store', 'uberfleet', 'leadgen-live-snapshot',
  'winnr-expansion-planner'
];

export function auditOutreachReachability() {
  const api = walk('api');
  const scripts = walk('scripts');
  const unattendedScripts = scripts.filter(f => !FOUNDER_INTERACTIVE_ENTRY_POINTS.includes(f));
  const production = reachableFromEntryPoints([...PRODUCTION_ENTRY_POINTS, ...api]);
  const operator = reachableFromEntryPoints([...PRODUCTION_ENTRY_POINTS, ...api, ...unattendedScripts]);
  const founder = reachableFromEntryPoints(FOUNDER_INTERACTIVE_ENTRY_POINTS);

  const srcFiles = walk('src');
  const importers = new Map();
  const importRe = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  const scanOwners = [...srcFiles, 'server.mjs', 'server-core.mjs', 'worker.mjs', ...api, ...scripts];
  for (const file of scanOwners) {
    if (!existsSync(join(root, file))) continue;
    const text = readFileSync(join(root, file), 'utf8');
    let m;
    while ((m = importRe.exec(text))) {
      const spec = m[1] || m[2];
      if (!spec || !spec.startsWith('.')) continue;
      const target = join(dirname(file), spec).replace(/\\/g, '/');
      const normalized = target.endsWith('.mjs') ? target : `${target}.mjs`;
      if (!importers.has(normalized)) importers.set(normalized, new Set());
      importers.get(normalized).add(file);
    }
  }
  const testFiles = walk('tests');
  const testImporters = new Map();
  for (const file of testFiles) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const spec of text.matchAll(/from\s*['"]\.\.\/(src\/[^'"]+)['"]/g)) {
      const key = spec[1];
      if (!testImporters.has(key)) testImporters.set(key, new Set());
      testImporters.get(key).add(file);
    }
  }
  let classification = { modules: {} };
  try { classification = JSON.parse(readFileSync(join(root, 'config', 'reachability-classification.json'), 'utf8')); } catch { /* none */ }

  const wanted = srcFiles.filter(f => OUTREACH_MODULE_GLOBS.some(g => f === `src/${g}.mjs` || f.startsWith(`src/${g}-`)));
  const modules = wanted.map(file => {
    const prodCallers = [...(importers.get(file) || [])].filter(c => production.has(c) || ['server.mjs', 'worker.mjs', 'server-core.mjs'].includes(c) || api.includes(c)).sort();
    const operatorCallers = [...(importers.get(file) || [])].filter(c => c.startsWith('scripts/')).sort();
    const tests = [...(testImporters.get(file) || [])].sort();
    let cls;
    if (production.has(file)) cls = 'PRODUCTION_REACHABLE';
    else if (operator.has(file)) cls = 'OPERATOR_REACHABLE';
    else if (founder.has(file)) cls = 'FOUNDER_INTERACTIVE_ONLY';
    else if (classification.modules?.[file]) cls = `CLASSIFIED_${classification.modules[file].category || 'UNREACHABLE'}`;
    else if (tests.length) cls = 'TEST_ONLY';
    else cls = 'UNKNOWN';
    return {
      module: file, class: cls,
      productionCallers: prodCallers.slice(0, 5),
      operatorScriptCallers: operatorCallers.slice(0, 5),
      testCount: tests.length,
      classificationReason: classification.modules?.[file]?.reason || null
    };
  });
  return { schema: 'uberbond.outreach-reachability.v1', measurementMode: 'LIVE_COMPUTED_FROM_IMPORT_GRAPH', moduleCount: modules.length, modules };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = auditOutreachReachability();
  const out = join(root, 'artifacts', 'outreach', 'outreach-reachability-20261002.json');
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  const tally = {};
  for (const m of report.modules) tally[m.class] = (tally[m.class] || 0) + 1;
  console.log(JSON.stringify({ wrote: 'artifacts/outreach/outreach-reachability-20261002.json', tally }, null, 2));
  for (const m of report.modules) if (m.class !== 'PRODUCTION_REACHABLE') console.log(m.class.padEnd(28), m.module, m.testCount ? `(tests:${m.testCount})` : '');
}
