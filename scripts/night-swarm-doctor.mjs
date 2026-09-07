import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..');
const AGENTS = new Set(['SOL', 'CLAUDE', 'UBERBOND', 'WORK']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => path.join(dir, name));
}

function packetId(packet) {
  if (typeof packet === 'string') return packet.trim().split(/\s+/, 1)[0];
  return packet?.id || packet?.packetId || '';
}

function normalizeSurfaces(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))].sort();
}

function surfacesOverlap(a, b) {
  for (const left of a) {
    for (const right of b) {
      if (left === right) return true;
      if (left.endsWith('/') && right.startsWith(left)) return true;
      if (right.endsWith('/') && left.startsWith(right)) return true;
    }
  }
  return false;
}

export function inspectNightSwarm({ repoRoot = defaultRoot } = {}) {
  const controlPath = path.join(repoRoot, 'artifacts/night/swarm-control-plane.json');
  const reasons = [];
  if (!fs.existsSync(controlPath)) {
    return {
      schema: 'uberbond.night-swarm-doctor.v1',
      status: 'REFUSED',
      reasons: ['swarm-control-plane-missing'],
      businessEffectAuthority: 'NONE'
    };
  }

  let control;
  try { control = readJson(controlPath); }
  catch { return { schema: 'uberbond.night-swarm-doctor.v1', status: 'REFUSED', reasons: ['swarm-control-plane-invalid-json'], businessEffectAuthority: 'NONE' }; }

  const theaters = Array.isArray(control.theaters) ? control.theaters : [];
  const ids = [];
  for (const theater of theaters) {
    const packets = Array.isArray(theater.packets) ? theater.packets : [];
    for (const packet of packets) ids.push(packetId(packet));
  }

  const duplicates = ids.filter((id, index) => id && ids.indexOf(id) !== index);
  const uniqueIds = new Set(ids.filter(Boolean));
  if (theaters.length !== 8) reasons.push('theater-count-must-be-8');
  if (ids.length !== 64) reasons.push('packet-count-must-be-64');
  if (uniqueIds.size !== ids.length) reasons.push('packet-ids-must-be-unique');
  if (duplicates.length) reasons.push('duplicate-packet-id');
  if (Number(control.packetPolicy?.targetPackets) !== 64) reasons.push('target-packets-must-match-64');
  if (control.integrationSpine?.pr !== 458) reasons.push('integration-spine-must-be-pr-458');
  if (control.commandIssue !== 463) reasons.push('command-issue-must-be-463');

  const claimsDir = path.join(repoRoot, 'artifacts/night/swarm/claims');
  const receiptDir = path.join(repoRoot, 'artifacts/night/swarm/receipts');
  const claims = [];
  const malformedClaims = [];
  for (const file of listJsonFiles(claimsDir)) {
    try {
      const claim = readJson(file);
      const id = String(claim.packetId || '').trim();
      const agent = String(claim.agent || '').trim();
      const status = String(claim.status || 'ACTIVE').trim();
      const writeSurfaces = normalizeSurfaces(claim.writeSurfaces);
      if (!uniqueIds.has(id) || !AGENTS.has(agent) || writeSurfaces.length === 0) malformedClaims.push(path.basename(file));
      claims.push({ file: path.basename(file), packetId: id, agent, status, writeSurfaces });
    } catch { malformedClaims.push(path.basename(file)); }
  }
  if (malformedClaims.length) reasons.push('malformed-swarm-claim');

  const activeClaims = claims.filter(claim => !['RELEASED', 'MERGED', 'SUPERSEDED'].includes(claim.status));
  const collisions = [];
  for (let i = 0; i < activeClaims.length; i += 1) {
    for (let j = i + 1; j < activeClaims.length; j += 1) {
      const a = activeClaims[i];
      const b = activeClaims[j];
      if (a.agent === b.agent && a.packetId === b.packetId) continue;
      if (surfacesOverlap(a.writeSurfaces, b.writeSurfaces)) collisions.push({ a: a.file, b: b.file });
    }
  }
  if (collisions.length) reasons.push('active-write-surface-collision');

  let receipts = 0;
  let malformedReceipts = 0;
  for (const file of listJsonFiles(receiptDir)) {
    try {
      const receipt = readJson(file);
      if (!uniqueIds.has(String(receipt.packetId || '').trim()) || !AGENTS.has(String(receipt.agent || '').trim())) malformedReceipts += 1;
      else receipts += 1;
    } catch { malformedReceipts += 1; }
  }
  if (malformedReceipts) reasons.push('malformed-swarm-receipt');

  return {
    schema: 'uberbond.night-swarm-doctor.v1',
    status: reasons.length ? 'REFUSED' : 'READY',
    reasons: [...new Set(reasons)],
    theaters: theaters.length,
    packets: ids.length,
    uniquePackets: uniqueIds.size,
    activeClaims: activeClaims.length,
    receipts,
    collisions,
    malformedClaims,
    malformedReceipts,
    runtimeProof: 'STATIC_COORDINATION_ONLY',
    businessEffectAuthority: 'NONE',
    note: 'READY proves swarm metadata consistency only. It does not prove child source, tests, deployments, customers, payments, or life outcomes.'
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = inspectNightSwarm();
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'READY') process.exitCode = 1;
}
