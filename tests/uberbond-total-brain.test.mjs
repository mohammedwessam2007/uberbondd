import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const totalBrainPath = path.join(root, 'docs/UBERBOND_TOTAL_BRAIN.md');
const totalBrainIndexPath = path.join(root, 'artifacts/uberbond-total-brain.json');
const bootstrapPath = path.join(root, 'UBERBOND_BOOTSTRAP.json');
const agentsPath = path.join(root, 'AGENTS.md');
const canonPath = path.join(root, 'UBERBOND_CANON.md');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function parse(relative) {
  return JSON.parse(read(relative));
}

test('Total Brain is durable, machine-readable, and part of mandatory startup', () => {
  assert.equal(fs.existsSync(totalBrainPath), true);
  assert.equal(fs.existsSync(totalBrainIndexPath), true);

  const brain = parse('artifacts/uberbond-total-brain.json');
  const bootstrap = parse('UBERBOND_BOOTSTRAP.json');
  const agents = read('AGENTS.md');
  const canon = read('UBERBOND_CANON.md');

  assert.equal(brain.project, 'UberBond');
  assert.equal(brain.northStar, 'risk-adjusted cleared contribution profit per founder minute');
  assert.equal(brain.humanReadableCompanion, 'docs/UBERBOND_TOTAL_BRAIN.md');
  assert.ok(bootstrap.canonPointers.includes('docs/UBERBOND_TOTAL_BRAIN.md'));
  assert.ok(bootstrap.canonPointers.includes('artifacts/uberbond-total-brain.json'));
  assert.equal(bootstrap.totalBrainPath, 'docs/UBERBOND_TOTAL_BRAIN.md');
  assert.equal(bootstrap.totalBrainIndexPath, 'artifacts/uberbond-total-brain.json');
  assert.match(agents, /No-amputation law/);
  assert.match(canon, /No-amputation continuity law/);
});

test('Total Brain preserves the major named lineages instead of narrowing to the latest offer', () => {
  const brain = parse('artifacts/uberbond-total-brain.json');
  const families = brain.namedInitiativeFamilies;

  assert.deepEqual(families.everestChain, ['Everest', 'SUMMIT 100', 'BLACK SKY', 'Reality Activation']);
  assert.ok(families.singularities.includes('First-Cash Singularity'));
  assert.ok(families.singularities.includes('Research Singularity'));
  assert.ok(families.singularities.includes('Distribution Singularity'));
  assert.ok(families.singularities.includes('World Capability Genome Singularity'));
  assert.ok(families.kilimanjaro.includes('Final Boss Kilimanjaro'));
  assert.ok(families.ragnarok.includes('Ragnarok Final Closure'));
  assert.ok(families.omnia.includes('OMNIA X64M Sovereign Mesh V7'));
  assert.ok(families.omnia.includes('OMNIA V9 Policy-Evidence-Execution Admission Kernel'));
  assert.ok(families.opportunityWorldBrain.includes('Project Prometheus'));
  assert.ok(families.opportunityWorldBrain.includes('Opportunity Factory'));
  assert.ok(families.opportunityWorldBrain.includes('Mechanism Lab'));
  assert.ok(families.capabilityFrontier.includes('Capability Genome'));
  assert.ok(families.capabilityFrontier.includes('SaaS Cannibal'));
  assert.ok(families.capabilityFrontier.includes('Gamechanger Intelligence Mesh'));
  assert.ok(families.capabilityFrontier.includes('Open Model Universe'));
});

test('Total Brain preserves crawler, software-absorption, idea-generation and local-model scope', () => {
  const brain = parse('artifacts/uberbond-total-brain.json');
  const domains = new Set(brain.capabilityDomains);
  const refs = new Set(brain.softwareReferenceSurfaces);
  const runtimes = new Set(brain.openModelRuntimes);

  assert.ok(domains.has('public-web browser evidence and lawful crawling'));
  assert.ok(domains.has('prospect-supply/source adapters'));
  assert.ok(domains.has('Mechanism Lab atom extraction and recombination'));
  assert.ok(domains.has('SaaS Cannibal and clean-room feature absorption'));
  assert.ok(domains.has('Open Model Universe and local/open model market'));
  assert.ok(refs.has('Apollo'));
  assert.ok(refs.has('Clay'));
  assert.ok(refs.has('Instantly'));
  assert.ok(refs.has('Common Room'));
  assert.ok(refs.has('Ocean.io'));
  assert.ok(refs.has('ZeroBounce'));
  assert.ok(runtimes.has('VLLM'));
  assert.ok(runtimes.has('SGLANG'));
  assert.ok(runtimes.has('LLAMA_CPP_GGUF'));
  assert.ok(runtimes.has('OLLAMA'));
  assert.ok(runtimes.has('MLX_LM'));
});

test('Total Brain cannot promote superset memory into current commercial proof', () => {
  const brain = parse('artifacts/uberbond-total-brain.json');
  const markdown = read('docs/UBERBOND_TOTAL_BRAIN.md');

  assert.match(brain.notClaimed, /not proof/i);
  assert.ok(brain.permanentTruthLaws.includes('payment link cannot create cleared payment'));
  assert.ok(brain.permanentTruthLaws.includes('sandbox events cannot create real revenue'));
  assert.ok(brain.permanentTruthLaws.includes('founder absence requires real elapsed proof'));
  assert.match(markdown, /Current truth boundary/);
  assert.match(markdown, /Architecture, code, tests, models, research rows, payment links, sandbox events and deployment status cannot manufacture those commercial outcomes/);
});

test('repository memory contains no secret-shaped values introduced by Total Brain', () => {
  const text = `${read('docs/UBERBOND_TOTAL_BRAIN.md')}\n${read('artifacts/uberbond-total-brain.json')}`;
  assert.doesNotMatch(text, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(text, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
  assert.doesNotMatch(text, /AI_GATEWAY_API_KEY\s*[=:]\s*['\"][^'\"]+['\"]/);
});
