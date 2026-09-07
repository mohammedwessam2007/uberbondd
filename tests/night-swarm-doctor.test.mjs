import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectNightSwarm } from '../scripts/night-swarm-doctor.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

function copyControlPlane(dest) {
  fs.mkdirSync(path.join(dest, 'artifacts/night'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'artifacts/night/swarm-control-plane.json'), path.join(dest, 'artifacts/night/swarm-control-plane.json'));
}

test('current night swarm control plane has exactly 64 unique packets and no collisions', () => {
  const report = inspectNightSwarm({ repoRoot: ROOT });
  assert.equal(report.status, 'READY');
  assert.equal(report.theaters, 8);
  assert.equal(report.packets, 64);
  assert.equal(report.uniquePackets, 64);
  assert.equal(report.collisions.length, 0);
  assert.equal(report.businessEffectAuthority, 'NONE');
});

test('duplicate packet IDs fail closed instead of inflating throughput', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-swarm-dup-'));
  try {
    copyControlPlane(dir);
    const file = path.join(dir, 'artifacts/night/swarm-control-plane.json');
    const control = JSON.parse(fs.readFileSync(file, 'utf8'));
    control.theaters[1].packets[0] = control.theaters[0].packets[0];
    fs.writeFileSync(file, JSON.stringify(control, null, 2));
    const report = inspectNightSwarm({ repoRoot: dir });
    assert.equal(report.status, 'REFUSED');
    assert.ok(report.reasons.includes('packet-ids-must-be-unique'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('overlapping active write surfaces across agents fail closed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-swarm-collision-'));
  try {
    copyControlPlane(dir);
    const claims = path.join(dir, 'artifacts/night/swarm/claims');
    fs.mkdirSync(claims, { recursive: true });
    fs.writeFileSync(path.join(claims, 'cash.sol.json'), JSON.stringify({
      packetId: 'CASH-01', agent: 'SOL', status: 'ACTIVE', writeSurfaces: ['src/payment-runtime.mjs']
    }));
    fs.writeFileSync(path.join(claims, 'forecast.claude.json'), JSON.stringify({
      packetId: 'FORECAST-01', agent: 'CLAUDE', status: 'ACTIVE', writeSurfaces: ['src/payment-runtime.mjs']
    }));
    const report = inspectNightSwarm({ repoRoot: dir });
    assert.equal(report.status, 'REFUSED');
    assert.ok(report.reasons.includes('active-write-surface-collision'));
    assert.equal(report.collisions.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('malformed claims do not silently reserve packets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-swarm-malformed-'));
  try {
    copyControlPlane(dir);
    const claims = path.join(dir, 'artifacts/night/swarm/claims');
    fs.mkdirSync(claims, { recursive: true });
    fs.writeFileSync(path.join(claims, 'bad.json'), JSON.stringify({ packetId: 'NOT-REAL', agent: 'UNKNOWN', writeSurfaces: [] }));
    const report = inspectNightSwarm({ repoRoot: dir });
    assert.equal(report.status, 'REFUSED');
    assert.ok(report.reasons.includes('malformed-swarm-claim'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
