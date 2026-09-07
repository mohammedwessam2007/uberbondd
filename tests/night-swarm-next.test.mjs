import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getNextNightSwarmPackets } from '../scripts/night-swarm-next.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

function fixtureRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-swarm-next-'));
  fs.mkdirSync(path.join(dir, 'artifacts/night'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'artifacts/night/swarm-control-plane.json'), path.join(dir, 'artifacts/night/swarm-control-plane.json'));
  return dir;
}

test('dispatcher returns owner-matched packets and is read-only', () => {
  const result = getNextNightSwarmPackets({ repoRoot: ROOT, agent: 'CLAUDE', limit: 3 });
  assert.equal(result.status, 'READY');
  assert.equal(result.agent, 'CLAUDE');
  assert.equal(result.packets.length, 3);
  assert.ok(result.packets.every(p => ['FORECAST', 'GENESIS', 'PCE', 'SOVEREIGN'].includes(p.theater)));
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('active claim is skipped so agents do not duplicate work', () => {
  const dir = fixtureRoot();
  try {
    const claims = path.join(dir, 'artifacts/night/swarm/claims');
    fs.mkdirSync(claims, { recursive: true });
    fs.writeFileSync(path.join(claims, 'forecast.claude.json'), JSON.stringify({ packetId: 'FORECAST-01', agent: 'CLAUDE', status: 'ACTIVE', writeSurfaces: ['src/x.mjs'] }));
    const result = getNextNightSwarmPackets({ repoRoot: dir, agent: 'CLAUDE', limit: 8 });
    assert.ok(!result.packets.some(p => p.packetId === 'FORECAST-01'));
    assert.ok(result.skippedActive.includes('FORECAST-01'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('verified receipt is skipped permanently', () => {
  const dir = fixtureRoot();
  try {
    const receipts = path.join(dir, 'artifacts/night/swarm/receipts');
    fs.mkdirSync(receipts, { recursive: true });
    fs.writeFileSync(path.join(receipts, 'genesis.claude.json'), JSON.stringify({ packetId: 'GENESIS-01', agent: 'CLAUDE', result: 'PASS' }));
    const result = getNextNightSwarmPackets({ repoRoot: dir, agent: 'CLAUDE', limit: 16 });
    assert.ok(!result.packets.some(p => p.packetId === 'GENESIS-01'));
    assert.ok(result.skippedComplete.includes('GENESIS-01'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('unknown agent is refused rather than silently claiming arbitrary work', () => {
  const result = getNextNightSwarmPackets({ repoRoot: ROOT, agent: 'RANDOM', limit: 4 });
  assert.equal(result.status, 'REFUSED');
  assert.equal(result.reason, 'unknown-agent');
  assert.deepEqual(result.packets, []);
});
