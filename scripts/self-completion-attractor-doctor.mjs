#!/usr/bin/env node
import { compileSelfCompletionAttractor } from '../src/self-completion-attractor.mjs';

const fixture = [
  { id: 'source-brainstem', label: 'source brainstem', state: 'VERIFIED_CURRENT', closureClass: 'INTERNAL_SOURCE', requires: [], unlockWeight: 10, evidenceStrength: 1, effortUnits: 1 },
  { id: 'private-sensorium', label: 'private Life Sensorium source', state: 'PARTIAL_CURRENT', closureClass: 'INTERNAL_SOURCE', requires: ['source-brainstem'], unlockWeight: 8, evidenceStrength: 0.8, effortUnits: 2 },
  { id: 'owned-founder-host', label: 'owned founder host evidence', state: 'MISSING', closureClass: 'OWNED_PHYSICAL_HOST', requires: ['source-brainstem'], unlockWeight: 16, evidenceStrength: 0, effortUnits: 8 },
  { id: 'ambient-interface', label: 'ambient interface evidence', state: 'MISSING', closureClass: 'OWNED_PHYSICAL_HOST', requires: ['private-sensorium', 'owned-founder-host'], unlockWeight: 14, evidenceStrength: 0, effortUnits: 12 },
  { id: 'real-customer', label: 'real commercial proof', state: 'MISSING', closureClass: 'EXTERNAL_COMMERCIAL', requires: ['source-brainstem'], unlockWeight: 12, evidenceStrength: 0, effortUnits: 5 },
  { id: 'longitudinal-life-evidence', label: 'longitudinal life outcome evidence', state: 'MISSING', closureClass: 'ELAPSED_REALITY', requires: ['private-sensorium'], unlockWeight: 18, evidenceStrength: 0, effortUnits: 365 }
];

const report = compileSelfCompletionAttractor({ nodes: fixture });
const output = {
  ...report,
  fixture: 'SYNTHETIC_CURRENT_SHAPE_ONLY',
  doctorBoundary: 'THIS_DOCTOR_TESTS_GAP_GRAPH_MECHANICS__IT_IS_NOT_AN_EXACT_CURRENT_TERMINAL_TRIBUNAL_AND_DOES_NOT_CLOSE_PHYSICAL_COMMERCIAL_OR_ELAPSED_GAPS'
};
console.log(JSON.stringify(output, null, 2));
if (!report.ok) process.exitCode = 1;
