import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(relative) {
  return fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
}
function parse(relative) { return JSON.parse(read(relative)); }

test('recovered Total Brain lineages and owner goals are mandatory canon pointers', () => {
  const bootstrap = parse('UBERBOND_BOOTSTRAP.json');
  for (const path of [
    'docs/UBERBOND_TOTAL_BRAIN_RECOVERY_ADDENDUM.md',
    'artifacts/uberbond-total-brain-recovery-addendum.json',
    'docs/memory/UBERBOND_OWNER_GOALS_2026-09-02.md'
  ]) assert.ok(bootstrap.canonPointers.includes(path), `missing canon pointer: ${path}`);
});

test('recovered overlay preserves named systems that the first brain draft could otherwise flatten away', () => {
  const overlay = parse('artifacts/uberbond-total-brain-recovery-addendum.json');
  const names = new Set(overlay.entries.map(entry => entry.name));
  for (const name of [
    'UberBond Growth Graph Expansion',
    'Cost -> Stage -> Fulfill -> Learn Spine',
    'Autonomous Agent Mesh V1',
    'Agent Relay Bus',
    'V5 Evidence Kernel / SLIM_TO_V5',
    'Cloneable Market Feature Inventory',
    'Sender Infrastructure Mesh',
    'Evidence-to-Content Compiler',
    'World Brain Field Mission'
  ]) assert.ok(names.has(name), `missing recovered lineage: ${name}`);
});

test('owner commercial responsibility and parallel improvement laws remain explicit', () => {
  const overlay = parse('artifacts/uberbond-total-brain-recovery-addendum.json');
  assert.ok(overlay.ownerLaws.some(value => /Customer acquisition and economic proof are UberBond responsibilities/.test(value)));
  assert.ok(overlay.ownerLaws.some(value => /operate -> earn -> observe -> learn -> improve -> operate better -> earn more/.test(value)));
  assert.ok(overlay.ownerLaws.some(value => /separate engineering-readiness, commercial-proof, autonomy\/founder-minute and self-improvement\/economic-lift scoreboards/.test(value)));
});
