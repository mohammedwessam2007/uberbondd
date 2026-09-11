#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { compileContextProjection } from '../src/context-projection.mjs';
import { mountSovereignContext } from './sovereign-context-mount.mjs';

export const SOVEREIGN_FOUNDER_DIALOGUE_CONTEXT_VERSION = 'sovereign-founder-dialogue-context-1.0.0';

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function fail(reasonCodes, status = 'FOUNDER_DIALOGUE_CONTEXT_REFUSED', extra = {}) {
  return {
    ok: false,
    contextVersion: SOVEREIGN_FOUNDER_DIALOGUE_CONTEXT_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

export function mountFounderDialogueContext({
  rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  controlDir = '/var/lib/uberbond-control',
  mission,
  generatedAt = new Date()
} = {}) {
  const founderMission = String(mission || '').trim();
  if (!founderMission || founderMission.length > 16_000) return fail(['bounded-founder-dialogue-mission-required']);
  const absoluteControl = path.resolve(controlDir);
  const journalPath = path.join(absoluteControl, 'context', 'events.jsonl');
  const capsuleCachePath = path.join(absoluteControl, 'context', 'brainstate.json');

  // Deliberately do not persist a mission-specific mount. The founder's raw
  // turn may be private; only the durable Brainstate cache is refreshed here.
  const mounted = mountSovereignContext({
    rootDir,
    journalPath,
    capsuleCachePath,
    mountCachePath: null,
    mission: founderMission,
    maxHistoricalEvents: 8,
    generatedAt
  });
  if (!mounted.ok) return fail(['verified-founder-context-mount-required', ...(mounted.reasonCodes || [])], 'FOUNDER_DIALOGUE_CONTEXT_MOUNT_REFUSED', { contextMountStatus: mounted.status });
  const compiled = compileContextProjection({ mountResult: mounted, audience: 'founder-dialogue', maxHistory: 8 });
  if (!compiled.ok) return fail(['founder-context-projection-required', ...(compiled.reasonCodes || [])]);

  return {
    ok: true,
    contextVersion: SOVEREIGN_FOUNDER_DIALOGUE_CONTEXT_VERSION,
    status: 'FOUNDER_DIALOGUE_CONTEXT_READY',
    projection: compiled.projection,
    contextMountStatus: mounted.status,
    recompiledFromStale: mounted.mount?.recompiledFromStale === true,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'Founder dialogue receives a bounded verified context projection. The raw founder turn is used as retrieval query for this turn and is not persisted by this context helper.'
  };
}
