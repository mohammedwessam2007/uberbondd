#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUberBondBrainFromRepository } from './uberbond-brain-bootstrap.mjs';
import {
  compileBrainstateCapsule,
  compileMissionContext,
  verifyBrainstateFreshness,
  verifyBrainstateIntegrity
} from '../src/sovereign-context-fabric.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

export const SOVEREIGN_CONTEXT_DOCTOR_VERSION = 'sovereign-context-doctor-1.1.0';
export const TERMINAL_NORTH_STAR_PATH = 'artifacts/sovereign-cognitive-continuum-total-north-star.json';
export const CURRENT_HANDOFF_PATH = 'docs/CURRENT_HANDOFF.json';

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return null;
  return process.argv[index + 1];
}

function safeReadJson(file) {
  const absolute = path.resolve(file);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8_000_000) throw new Error('unsafe-brainstate-capsule-file');
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('brainstate-capsule-object-required');
  return parsed;
}

function safeWriteJson(file, value) {
  const absolute = path.resolve(file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.tmp.${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, absolute);
  return absolute;
}

function strings(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()) : [];
}

function nextExecutorActions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value)
    .filter(([, item]) => typeof item === 'string' && item.trim())
    .map(([key, item]) => `${key}: ${item.trim()}`);
}

export function overlayExactCurrentContext({ packet, rootDir } = {}) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) throw new Error('brain-packet-required');
  const root = path.resolve(rootDir || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const terminal = safeReadJson(path.join(root, TERMINAL_NORTH_STAR_PATH));
  const handoff = safeReadJson(path.join(root, CURRENT_HANDOFF_PATH));

  if (terminal.canonicalName !== 'Sovereign Cognitive Continuum') throw new Error('terminal-north-star-name-mismatch');
  if (typeof terminal.canonicalDefinition !== 'string' || !terminal.canonicalDefinition.trim()) throw new Error('terminal-north-star-definition-required');
  if (typeof terminal.subordinateEconomicObjective !== 'string' || !terminal.subordinateEconomicObjective.trim()) throw new Error('subordinate-economic-objective-required');
  if (typeof handoff.activeMission !== 'string' || !handoff.activeMission.trim()) throw new Error('current-handoff-active-mission-required');

  const completed = strings(handoff.completed).length
    ? strings(handoff.completed)
    : strings(handoff.completedSincePreviousCheckpoint);
  const blockers = strings(handoff.blockers).length
    ? strings(handoff.blockers)
    : strings(handoff.genuineBlockers);
  const nextActions = strings(handoff.nextActions).length
    ? strings(handoff.nextActions)
    : nextExecutorActions(handoff.nextExecutor);

  const basis = typeof handoff.sourceCommit === 'string' ? handoff.sourceCommit.toLowerCase() : null;
  return {
    ...packet,
    objective: terminal.canonicalDefinition.trim(),
    economicNorthStar: terminal.subordinateEconomicObjective.trim(),
    endState: `${terminal.canonicalName}: ${terminal.canonicalDefinition.trim()}`,
    currentHandoff: {
      ...packet.currentHandoff,
      handoffBasisSha: basis,
      activeMission: handoff.activeMission.trim(),
      completed,
      blockers,
      nextActions,
      freshAgainstSourceCommit: Boolean(basis && basis === packet.sourceCommit)
    },
    terminalContext: {
      schemaVersion: terminal.schemaVersion || null,
      status: terminal.status || null,
      canonicalName: terminal.canonicalName,
      canonicalDefinition: terminal.canonicalDefinition.trim(),
      terminalTriad: terminal.terminalTriad || null,
      canonicalHierarchy: Array.isArray(terminal.canonicalHierarchy) ? terminal.canonicalHierarchy : [],
      subordinateEconomicObjective: terminal.subordinateEconomicObjective.trim(),
      truthBoundary: terminal.truthBoundary || null,
      containedNorthStar: handoff.containedNorthStar || 'Personal Civilization Engine'
    }
  };
}

export function runSovereignContextDoctor({
  rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  sourceCommit = null,
  capsule = null,
  mission = null,
  generatedAt = new Date()
} = {}) {
  const basePacket = loadUberBondBrainFromRepository({ rootDir, sourceCommit, now: generatedAt });
  const packet = overlayExactCurrentContext({ packet: basePacket, rootDir });
  const compiled = compileBrainstateCapsule({ packet, generatedAt });
  if (!compiled.ok) return compiled;

  const candidate = capsule || compiled.capsule;
  const integrity = verifyBrainstateIntegrity(candidate);
  if (!integrity.ok) return integrity;
  const freshness = verifyBrainstateFreshness({ capsule: candidate, currentPacket: packet });
  const missionContext = freshness.ok
    ? compileMissionContext({ capsule: compiled.capsule, mission: mission || packet.currentHandoff.activeMission })
    : null;

  return {
    ok: freshness.ok && missionContext?.ok === true,
    schemaVersion: 'uberbond.sovereign-context-doctor.v1',
    doctorVersion: SOVEREIGN_CONTEXT_DOCTOR_VERSION,
    status: freshness.ok ? 'CONTEXT_CURRENT__MISSION_CONTEXT_READY' : freshness.status,
    sourceCommit: packet.sourceCommit,
    brainstateId: compiled.capsule.brainstateId,
    contextIdentityDigest: compiled.capsule.contextIdentity.identityDigest,
    terminalNorthStar: packet.terminalContext,
    handoffFreshAgainstSourceCommit: compiled.capsule.frontier.handoffFreshAgainstSourceCommit,
    freshness,
    capsule: compiled.capsule,
    missionContext: missionContext?.ok ? missionContext.context : null,
    reasonCodes: freshness.ok ? [] : freshness.reasonCodes,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    const capsulePath = argValue('--capsule');
    const outputPath = argValue('--write-capsule');
    const mission = argValue('--mission');
    const capsule = capsulePath ? safeReadJson(capsulePath) : null;
    const result = runSovereignContextDoctor({ capsule, mission });
    if (outputPath && result.capsule) result.writtenCapsule = safeWriteJson(outputPath, result.capsule);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      status: 'SOVEREIGN_CONTEXT_DOCTOR_FAILED',
      reason: error?.message || 'unknown-error',
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
