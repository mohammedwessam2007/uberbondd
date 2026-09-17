// The V9 carrier materializer, and the line it must never cross.
//
// CLAUDE_START_V9.md requires LOSSLESS_VERIFIED and SHA-256
// 8ad73f53...e55d before canonical V9 may be treated as canonical. The carrier
// in this repository cannot produce that: seed part 16 is 6,500 bytes where the
// manifest requires 12,933, and those missing bytes are LZMA-compressed content
// that exists in no git object.
//
// So these tests defend two things at once. The verifier must keep refusing --
// a partial carrier may never print LOSSLESS_VERIFIED, and no manifest hash may
// be edited to let one pass. And the refusal must stay legible: the original
// exited on the first mismatched part, which reported total corruption when the
// truth was fourteen parts missing a stripped newline and one genuinely short.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const SCRIPT = 'scripts/materialize-inevitability-v9.py';
const CARRIER = 'artifacts/inevitability-v9-carrier';

function materialize(cwd = root) {
  try {
    return { code: 0, out: execFileSync('python3', [join(cwd, SCRIPT)], { cwd, encoding: 'utf8' }) };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

// A sandbox so a test may corrupt a part without touching the real carrier.
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'uberbond-v9-carrier-'));
  cpSync(join(root, CARRIER), join(dir, CARRIER), { recursive: true });
  cpSync(join(root, SCRIPT), join(dir, SCRIPT), { recursive: true });
  return dir;
}

test('a partial carrier never reports LOSSLESS_VERIFIED', () => {
  const result = materialize();
  // Asserted on the parsed status rather than a substring of the output: the
  // report's own notWeakened line contains the phrase LOSSLESS_VERIFIED, and a
  // naive substring check would fail on the refusal it is meant to confirm.
  const report = JSON.parse(result.out);
  assert.notEqual(report.status, 'LOSSLESS_VERIFIED', 'a carrier missing source bytes must not claim losslessness');
  assert.equal(report.status, 'CARRIER_INCOMPLETE__CANONICAL_V9_NOT_MATERIALIZED');
  assert.notEqual(result.code, 0, 'an incomplete carrier must exit non-zero');
});

test('the refusal names which part is short and by how much', () => {
  // The whole point of the change: one run, the full shape. Without this the
  // next reader repeats the archaeology that produced these numbers.
  const report = JSON.parse(materialize().out);
  assert.equal(report.section, 'seed');
  assert.equal(report.partsTotal, 16);
  assert.equal(report.partsUnrecoverable, 1);
  const short = report.unrecoverable[0];
  assert.equal(short.file, 'part-0016.xz.b64');
  assert.equal(short.expectedBytes - short.actualBytes, short.shortBy);
  assert.ok(report.missingEncodedBytes > 0);
  assert.ok(report.requiredToClose.sha256.length === 64, 'the report must name the source hash that would close it');
});

test('the fifteen intact parts are reported as verified, not lumped in with the broken one', () => {
  const report = JSON.parse(materialize().out);
  assert.equal(report.partsVerified, 15);
  assert.equal(report.partsVerified + report.partsUnrecoverable + report.partsRepairableWithoutSource, report.partsTotal);
});

test('a stripped trailing newline is repairable, and the repair is hash-confirmed', () => {
  // Fourteen parts arrived this way. The repair is legitimate precisely because
  // the manifest hash confirms it rather than the shape of the damage
  // suggesting it -- which is what separates it from part 16.
  const dir = sandbox();
  try {
    const part = join(dir, CARRIER, 'seed-v7/part-0001.xz.b64');
    const bytes = readFileSync(part);
    assert.ok(bytes.at(-1) === 0x0a, 'fixture expects a well-formed part');
    writeFileSync(part, bytes.subarray(0, bytes.length - 1));

    const report = JSON.parse(materialize(dir).out);
    assert.equal(report.partsRepairableWithoutSource, 1, 'a stripped newline must classify as repairable');
    assert.equal(report.partsVerified, 14);
    // Still refuses overall, because part 16 remains short.
    assert.notEqual(JSON.parse(materialize(dir).out).status, 'LOSSLESS_VERIFIED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a truncated part is never classified as repairable', () => {
  // The dangerous confusion: treating "short" as "just needs a newline" would
  // silently admit fabricated content into a hash-locked artifact.
  const report = JSON.parse(materialize().out);
  assert.equal(report.unrecoverable[0].state, 'UNRECOVERABLE');
  assert.ok(report.partsRepairableWithoutSource === 0, 'nothing in the current carrier is newline-repairable any more');
});

test('the manifest still demands the full canonical artifact', () => {
  // A future session under pressure to get green could close this by editing
  // the manifest instead of supplying the bytes. These are the numbers that
  // would have to change for that to happen.
  const manifest = JSON.parse(readFileSync(join(root, CARRIER, 'MANIFEST.json'), 'utf8'));
  assert.equal(manifest.canonical.bytes, 146566257);
  assert.equal(manifest.canonical.lines, 232406);
  assert.equal(manifest.canonical.sha256, '8ad73f53116107acea824f6847aa6f29845e263b3ec01d241b90aae5719fe55d');
  assert.equal(manifest.seed.sourceBytes, 1916551);
  assert.equal(manifest.seed.sourceSha256, 'de93cca36a4c72411ff283d865be1c97cf7680abeb73146dfa48523da0e21921');
  assert.equal(manifest.noAmputation, true);
});

test('the start contract and the manifest agree on the canonical hash', () => {
  // Two files name the same hash. If they ever disagree, one of them has been
  // edited to match a weaker artifact.
  const contract = readFileSync(join(root, 'CLAUDE_START_V9.md'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(root, CARRIER, 'MANIFEST.json'), 'utf8'));
  assert.ok(contract.includes(manifest.canonical.sha256), 'CLAUDE_START_V9.md must require the manifest canonical hash');
  assert.ok(contract.includes('LOSSLESS_VERIFIED'));
});
