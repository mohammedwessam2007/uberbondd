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
if(reasons.includes('clean-truth-input-checkout-required-before-regeneration')){
  const paths=Array.isArray(receipt.dirtyTruthInputsBefore)?receipt.dirtyTruthInputsBefore:[];
  const p=String(paths[0]||'');
  if(p==='package-lock.json') process.exit(60);
  if(p==='package.json') process.exit(61);
  if(p.startsWith('artifacts/')) process.exit(62);
  if(p.startsWith('docs/')) process.exit(63);
  if(p.startsWith('scripts/')) process.exit(64);
  if(p.startsWith('src/')) process.exit(65);
  if(p.startsWith('tests/')) process.exit(66);
  if(p.startsWith('config/')) process.exit(67);
  if(p.startsWith('api/')) process.exit(68);
  if(p.startsWith('.claude/')) process.exit(69);
  if(['AGENTS.md','CLAUDE.md','UBERBOND_BOOTSTRAP.json','server.mjs','worker.mjs'].includes(p)) process.exit(70);
  process.exit(71);
}
const idx=order.findIndex(code=>reasons.includes(code));
process.exit(idx>=0?40+idx:90);
