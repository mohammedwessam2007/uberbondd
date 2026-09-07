import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..');
const VALID_AGENTS = new Set(['SOL', 'CLAUDE', 'UBERBOND', 'WORK']);

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function files(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.endsWith('.json')).map(n => path.join(dir, n)) : []; }
function idOf(packet) { return typeof packet === 'string' ? packet.trim().split(/\s+/, 1)[0] : packet?.id || packet?.packetId || ''; }
function descriptionOf(packet) { return typeof packet === 'string' ? packet.trim().slice(idOf(packet).length).trim() : String(packet?.description || ''); }
function owners(raw) { return String(raw || '').split('+').map(x => x.trim()).filter(Boolean); }

export function getNextNightSwarmPackets({ repoRoot = defaultRoot, agent, limit = 4 } = {}) {
  const normalizedAgent = String(agent || '').trim().toUpperCase();
  if (!VALID_AGENTS.has(normalizedAgent)) return { status: 'REFUSED', reason: 'unknown-agent', agent: normalizedAgent, packets: [] };

  const control = readJson(path.join(repoRoot, 'artifacts/night/swarm-control-plane.json'));
  const active = new Set();
  for (const file of files(path.join(repoRoot, 'artifacts/night/swarm/claims'))) {
    try {
      const claim = readJson(file);
      if (!['RELEASED', 'MERGED', 'SUPERSEDED'].includes(String(claim.status || 'ACTIVE'))) active.add(String(claim.packetId || '').trim());
    } catch {}
  }

  const completed = new Set();
  for (const file of files(path.join(repoRoot, 'artifacts/night/swarm/receipts'))) {
    try {
      const receipt = readJson(file);
      if (['PASS', 'MERGED', 'VERIFIED', 'COMPLETE'].includes(String(receipt.result || receipt.status || '').toUpperCase())) completed.add(String(receipt.packetId || '').trim());
    } catch {}
  }

  const candidates = [];
  for (const theater of control.theaters || []) {
    const theaterOwners = owners(theater.owner);
    if (!theaterOwners.includes(normalizedAgent)) continue;
    for (const packet of theater.packets || []) {
      const id = idOf(packet);
      if (!id || active.has(id) || completed.has(id)) continue;
      candidates.push({
        packetId: id,
        description: descriptionOf(packet),
        theater: theater.id,
        theaterGoal: theater.goal,
        integrationSpinePr: control.integrationSpine?.pr,
        commandIssue: control.commandIssue
      });
    }
  }

  return {
    status: 'READY',
    agent: normalizedAgent,
    requestedLimit: Number(limit),
    packets: candidates.slice(0, Math.max(1, Number(limit) || 4)),
    skippedActive: [...active].sort(),
    skippedComplete: [...completed].sort(),
    businessEffectAuthority: 'NONE',
    note: 'This dispatcher is advisory/read-only. Claiming requires the coordination protocol and exact write-surface declaration.'
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = getNextNightSwarmPackets({ agent: process.argv[2], limit: process.argv[3] || 4 });
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'READY') process.exitCode = 1;
}
