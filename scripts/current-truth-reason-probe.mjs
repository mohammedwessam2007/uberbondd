import { executeCurrentTruthRegeneration } from './current-truth-regeneration.mjs';

const order=[
  'git-head-status-and-tracked-tree-required',
  'clean-truth-input-checkout-required-before-regeneration',
  'readiness-generator-failed',
  'coverage-generator-failed',
  'canonical-leaf-graph-generator-failed',
  'internal-evidence-reference-integrity-required',
  'valid-exact-head-required',
  'readiness-generator-must-exit-zero',
  'coverage-generator-must-exit-zero',
  'canonical-leaf-graph-generator-must-exit-zero',
  'canonical-readiness-generator-required',
  'readiness-head-mismatch',
  'readiness-must-be-measured-from-clean-source-checkout',
  'live-reachability-measurement-required',
  'canonical-coverage-matrix-required',
  'coverage-head-mismatch',
  'canonical-zero-orphan-leaf-graph-required',
  'leaf-graph-head-mismatch',
  'truth-regeneration-mutated-unexpected-path',
  'current-reality-freeze-must-not-refuse',
  'freeze-head-mismatch'
];
const receipt=executeCurrentTruthRegeneration();
if(receipt.ok) process.exit(0);
const reasons=Array.isArray(receipt.reasonCodes)?receipt.reasonCodes:[];
const idx=order.findIndex(code=>reasons.includes(code));
process.exit(idx>=0?40+idx:90);
