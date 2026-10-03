import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('../scripts/global-policy-evidence.mjs', import.meta.url).pathname;
const run = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
const FTC = 'https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business';

test('recorder computes the hash from the evidence bytes, validates through the router compiler, and the doctor then shows the rule fresh', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gpe-'));
  try {
    const bundle = join(dir, 'bundle.json');
    writeFileSync(bundle, JSON.stringify({ schemaVersion: 'uberbond.global-policy-evidence-bundle.v1', rows: [] }));
    const ev = join(dir, 'ev.txt'); writeFileSync(ev, 'retrieved regulator text');
    const rec = run(['record', '--rule', 'recipient:US:can-spam-b2b-email', '--authority', 'REGULATOR_GUIDANCE', '--source-url', FTC, '--evidence-file', ev, '--bundle', bundle]);
    assert.equal(rec.status, 0, rec.stderr);
    const out = JSON.parse(rec.stdout);
    assert.equal(out.recorded, true); assert.equal(out.sendAuthority, false); assert.equal(out.externalEffects, 0);
    assert.match(out.evidenceHash, /^[a-f0-9]{64}$/);
    assert.equal(JSON.parse(readFileSync(bundle, 'utf8')).rows.length, 1);
    const doc = JSON.parse(run(['doctor', '--bundle', bundle]).stdout);
    assert.equal(doc.permissiveRulesFresh, 1);
    assert.ok(!doc.permissiveRulesNeedingRefresh.some(r => r.ruleId === 'recipient:US:can-spam-b2b-email'));
    assert.equal(doc.permissiveRules - 1, doc.permissiveRulesNeedingRefresh.length);
    assert.equal(run(['doctor', '--strict', '--bundle', bundle]).status, 2, 'strict doctor fails while any permissive rule needs refresh');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('recorder refuses a non-authoritative host, an unknown rule, an empty evidence file and an owner-authority row without attestation; nothing is written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gpe-'));
  try {
    const bundle = join(dir, 'bundle.json');
    const initial = JSON.stringify({ schemaVersion: 'uberbond.global-policy-evidence-bundle.v1', rows: [] });
    writeFileSync(bundle, initial);
    const ev = join(dir, 'ev.txt'); writeFileSync(ev, 'text');
    const empty = join(dir, 'empty.txt'); writeFileSync(empty, '  ');
    for (const args of [
      ['--rule', 'recipient:US:can-spam-b2b-email', '--authority', 'REGULATOR_GUIDANCE', '--source-url', 'https://evil.example/x', '--evidence-file', ev],
      ['--rule', 'recipient:ZZ:nope', '--authority', 'LAW', '--source-url', FTC, '--evidence-file', ev],
      ['--rule', 'recipient:US:can-spam-b2b-email', '--authority', 'REGULATOR_GUIDANCE', '--source-url', FTC, '--evidence-file', empty],
      ['--rule', 'recipient:US:can-spam-b2b-email', '--authority', 'OWNER_AUTHORITY', '--source-ref', 'owner says so', '--evidence-file', ev]
    ]) {
      const r = run(['record', ...args, '--bundle', bundle]);
      assert.notEqual(r.status, 0, args.join(' '));
    }
    assert.equal(readFileSync(bundle, 'utf8'), initial);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
