#!/usr/bin/env node
// Policy-evidence doctor and recorder for the Global Green-Lane Router.
//
//   node scripts/global-policy-evidence.mjs doctor [--strict] [--bundle PATH]
//   node scripts/global-policy-evidence.mjs record --rule RULE_ID --authority TYPE
//        (--source-url URL | --source-ref REF) --evidence-file PATH
//        [--uncertainty LOW|MEDIUM|HIGH] [--notes TEXT] [--param key=value ...]
//        [--retrieved-at ISO] [--bundle PATH] [--dry-run]
//
// `record` is the only supported way to add a row. The evidence hash is computed
// from the bytes of the retrieved source text you pass in --evidence-file; it
// cannot be typed in. The row is validated by the same compiler the router uses
// (authority type allowed for the rule, source host authoritative for the rule,
// timestamps sane), and a row that fails validation is refused, not written.
// Nothing here fetches a URL, spends money, or grants any permission: a row only
// attests "source S supports rule R as of T". Recording evidence for a rule the
// router's reviewed logic does not encode changes nothing.
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POLICY_RULE_CATALOG, DEFAULT_POLICY_EVIDENCE_BUNDLE_PATH, POLICY_EVIDENCE_BUNDLE_SCHEMA, compilePolicyEvidenceRow, loadPolicyEvidenceBundle, compilePolicyEvidenceStatus } from '../src/global-policy-evidence.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { _: [], params: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { out._.push(arg); continue; }
    const key = arg.slice(2);
    if (['strict', 'dry-run'].includes(key)) { out[key] = true; continue; }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${key} needs a value`);
    i += 1;
    if (key === 'param') { const [k, ...rest] = value.split('='); if (!k || !rest.length) throw new Error('--param needs key=value'); out.params[k] = rest.join('='); } else out[key] = value;
  }
  return out;
}

function doctor(args) {
  const bundlePath = args.bundle || DEFAULT_POLICY_EVIDENCE_BUNDLE_PATH;
  const now = new Date();
  const status = compilePolicyEvidenceStatus(loadPolicyEvidenceBundle({ root: isAbsolute(bundlePath) ? '' : root, path: bundlePath, now }), { now });
  console.log(JSON.stringify({ bundle: bundlePath, ...status }, null, 2));
  if (args.strict && (status.permissiveRulesNeedingRefresh.length || status.loadErrors.length || status.rejectedRows.length)) process.exitCode = 2;
}

function record(args) {
  const bundlePath = args.bundle || DEFAULT_POLICY_EVIDENCE_BUNDLE_PATH;
  const full = isAbsolute(bundlePath) ? bundlePath : join(root, bundlePath);
  if (!args.rule || !args.authority || !args['evidence-file']) throw new Error('record needs --rule, --authority and --evidence-file');
  if (!POLICY_RULE_CATALOG.some(r => r.ruleId === args.rule)) throw new Error(`unknown rule ${args.rule}; run doctor for the catalog`);
  const evidenceText = readFileSync(args['evidence-file'], 'utf8');
  if (!evidenceText.trim()) throw new Error('evidence file is empty: record the retrieved source text');
  const now = new Date();
  const input = {
    ruleId: args.rule,
    authorityType: args.authority,
    sourceUrl: args['source-url'] || undefined,
    sourceRef: args['source-ref'] || undefined,
    retrievedAt: args['retrieved-at'] || now.toISOString(),
    uncertainty: { level: args.uncertainty || 'LOW', notes: args.notes || '' },
    ruleParameters: args.params
  };
  const compiled = compilePolicyEvidenceRow(input, { now, evidenceText });
  if (!compiled.ok) { console.error(JSON.stringify({ recorded: false, errors: compiled.errors }, null, 2)); process.exitCode = 1; return; }
  const bundle = existsSync(full) ? JSON.parse(readFileSync(full, 'utf8')) : { schemaVersion: POLICY_EVIDENCE_BUNDLE_SCHEMA, rows: [] };
  if (bundle.schemaVersion !== POLICY_EVIDENCE_BUNDLE_SCHEMA || !Array.isArray(bundle.rows)) throw new Error('existing bundle has an unexpected schema; refusing to overwrite it');
  if (bundle.rows.some(r => r.policyId === compiled.row.policyId)) throw new Error('a row with this policyId already exists');
  bundle.rows.push(compiled.row);
  if (args['dry-run']) { console.log(JSON.stringify({ recorded: false, dryRun: true, row: compiled.row }, null, 2)); return; }
  const tmp = `${full}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(bundle, null, 2)}\n`);
  renameSync(tmp, full);
  console.log(JSON.stringify({ recorded: true, policyId: compiled.row.policyId, ruleId: compiled.row.ruleId, evidenceHash: compiled.row.evidenceHash, bundle: bundlePath, sendAuthority: false, externalEffects: 0 }, null, 2));
}

try {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'doctor';
  if (command === 'doctor') doctor(args);
  else if (command === 'record') record(args);
  else throw new Error(`unknown command ${command}`);
} catch (error) {
  console.error(`global-policy-evidence: ${error.message}`);
  process.exitCode = 1;
}
