import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGenesisIdeaRegistry } from '../src/perpetual-frontier-genesis.mjs';
import { validateMillionBranchIdeationGenome } from '../src/million-branch-ideation-genome.mjs';
import { validateSovereignExpansionKernel } from '../src/sovereign-expansion-kernel.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const docPath = resolve(root, 'docs/PERPETUAL_FRONTIER_GENESIS_CANON.md');
const indexPath = resolve(root, 'artifacts/perpetual-frontier-genesis.json');
const ideationIndexPath = resolve(root, 'artifacts/million-branch-ideation-genome.json');
const expansionIndexPath = resolve(root, 'artifacts/sovereign-expansion-kernel.json');
const selfCompletionIndexPath = resolve(root, 'artifacts/self-completion-attractor.json');
const sensoriumIndexPath = resolve(root, 'artifacts/life-sensorium.json');
const salienceIndexPath = resolve(root, 'artifacts/sovereign-salience-router.json');

const [markdown, indexRaw, ideationIndexRaw, expansionIndexRaw, selfCompletionRaw, sensoriumRaw, salienceRaw] = await Promise.all([
  readFile(docPath, 'utf8'),
  readFile(indexPath, 'utf8'),
  readFile(ideationIndexPath, 'utf8'),
  readFile(expansionIndexPath, 'utf8'),
  readFile(selfCompletionIndexPath, 'utf8'),
  readFile(sensoriumIndexPath, 'utf8'),
  readFile(salienceIndexPath, 'utf8')
]);

const index = JSON.parse(indexRaw);
const ideationIndex = JSON.parse(ideationIndexRaw);
const expansionIndex = JSON.parse(expansionIndexRaw);
const selfCompletionIndex = JSON.parse(selfCompletionRaw);
const sensoriumIndex = JSON.parse(sensoriumRaw);
const salienceIndex = JSON.parse(salienceRaw);
const registry = validateGenesisIdeaRegistry(markdown, index.ideaCount);
const ideationGenome = validateMillionBranchIdeationGenome();
const expansionKernel = validateSovereignExpansionKernel();

const requiredPointers = [
  'src/perpetual-frontier-genesis.mjs',
  'scripts/perpetual-frontier-genesis-doctor.mjs',
  'scripts/perpetual-frontier-genesis-tick.mjs',
  'tests/perpetual-frontier-genesis.test.mjs',
  'tests/perpetual-frontier-genesis-tick.test.mjs',
  '.github/workflows/gamechanger-mesh-hourly.yml',
  'docs/MILLION_BRANCH_IDEATION_GENOME.md',
  'artifacts/million-branch-ideation-genome.json',
  'src/million-branch-ideation-genome.mjs',
  'tests/genesis-million-branch-ideation.test.mjs',
  'docs/SOVEREIGN_EXPANSION_KERNEL.md',
  'artifacts/sovereign-expansion-kernel.json',
  'src/sovereign-expansion-kernel.mjs',
  'tests/genesis-sovereign-expansion-kernel.test.mjs',
  'artifacts/self-completion-attractor.json',
  'src/self-completion-attractor.mjs',
  'scripts/self-completion-attractor-doctor.mjs',
  'tests/self-completion-attractor.test.mjs',
  'tests/self-completion-attractor-doctor.test.mjs',
  'docs/LIFE_SENSORIUM_CANON.md',
  'artifacts/life-sensorium.json',
  'src/life-sensorium.mjs',
  'scripts/life-sensorium-doctor.mjs',
  'tests/life-sensorium.test.mjs',
  'tests/life-sensorium-doctor.test.mjs',
  'docs/SOVEREIGN_SALIENCE_ROUTER.md',
  'artifacts/sovereign-salience-router.json',
  'src/sovereign-salience-router.mjs',
  'tests/sovereign-salience-router.test.mjs'
];

const childValues = Object.values(expansionIndex.childOrgans || {}).flatMap(child => [
  child?.artifact,
  child?.canonicalDoc,
  child?.module,
  child?.doctor,
  child?.composedDoctor,
  ...(Array.isArray(child?.tests) ? child.tests : [])
]);
const pointerSet = new Set([
  index.firstExecutableLayer?.module,
  index.firstExecutableLayer?.doctor,
  index.firstExecutableLayer?.tick,
  index.firstExecutableLayer?.test,
  index.firstExecutableLayer?.tickTest,
  index.firstExecutableLayer?.hourlyWorkflow,
  index.millionBranchIdeationGenome?.canonicalDoc,
  index.millionBranchIdeationGenome?.artifact,
  index.millionBranchIdeationGenome?.module,
  index.millionBranchIdeationGenome?.test,
  index.sovereignExpansionKernel?.canonicalDoc,
  index.sovereignExpansionKernel?.artifact,
  index.sovereignExpansionKernel?.module,
  index.sovereignExpansionKernel?.test,
  ...childValues
].filter(Boolean));
const missingPointers = requiredPointers.filter(path => !pointerSet.has(path));
const missingFiles = [];
for (const relative of requiredPointers) {
  try {
    await access(resolve(root, relative));
  } catch {
    missingFiles.push(relative);
  }
}

const ideationArtifactHealthy = ideationIndex.schemaVersion === 'uberbond-million-branch-ideation-genome-1.0.0'
  && ideationIndex.domainCount === ideationGenome.domainCount
  && ideationIndex.operatorCount === ideationGenome.operatorCount
  && ideationIndex.generatorCount === ideationGenome.generatorCount
  && ideationIndex.sourceLineage?.sha256 === ideationGenome.sourceSha256
  && ideationIndex.businessEffectAuthority === 'NONE'
  && ideationIndex.externalEffectAuthority === 'NONE';

const expansionArtifactHealthy = expansionIndex.schemaVersion === 'uberbond-sovereign-expansion-kernel-1.1.0'
  && expansionIndex.canonicalDoc === 'docs/SOVEREIGN_EXPANSION_KERNEL.md'
  && expansionIndex.module === 'src/sovereign-expansion-kernel.mjs'
  && expansionIndex.test === 'tests/genesis-sovereign-expansion-kernel.test.mjs'
  && expansionIndex.lensCount === expansionKernel.lensCount
  && expansionIndex.businessEffectAuthority === 'NONE'
  && expansionIndex.externalEffectAuthority === 'NONE';

const selfCompletionArtifactHealthy = selfCompletionIndex.schemaVersion === 'uberbond-self-completion-attractor-1.0.0'
  && selfCompletionIndex.module === 'src/self-completion-attractor.mjs'
  && selfCompletionIndex.externalEffectAuthority === 'NONE';
const sensoriumArtifactHealthy = sensoriumIndex.schemaVersion === 'uberbond-life-sensorium-1.0.0'
  && sensoriumIndex.module === 'src/life-sensorium.mjs'
  && sensoriumIndex.repositoryPersistenceAllowed === false
  && sensoriumIndex.externalEffectAuthority === 'NONE';
const salienceArtifactHealthy = salienceIndex.schemaVersion === 'uberbond-sovereign-salience-router-1.0.0'
  && salienceIndex.module === 'src/sovereign-salience-router.mjs'
  && salienceIndex.externalEffectAuthority === 'NONE';

const healthy = registry.ok
  && ideationGenome.ok
  && ideationArtifactHealthy
  && expansionKernel.ok
  && expansionArtifactHealthy
  && selfCompletionArtifactHealthy
  && sensoriumArtifactHealthy
  && salienceArtifactHealthy
  && index.schemaVersion === 'uberbond-perpetual-frontier-genesis-1.2.0'
  && index.canonicalDoc === 'docs/PERPETUAL_FRONTIER_GENESIS_CANON.md'
  && index.businessEffectAuthority === 'NONE'
  && index.externalEffectAuthority === 'NONE'
  && missingPointers.length === 0
  && missingFiles.length === 0;

const result = {
  ok: healthy,
  status: healthy ? 'PERPETUAL_FRONTIER_GENESIS_HEALTHY' : 'PERPETUAL_FRONTIER_GENESIS_INVALID',
  ideaCount: registry.observedCount,
  expectedIdeaCount: registry.expectedCount,
  registryReasonCodes: registry.reasonCodes,
  ideationGenomeStatus: ideationGenome.status,
  ideationDomainCount: ideationGenome.domainCount,
  ideationOperatorCount: ideationGenome.operatorCount,
  ideationGeneratorCount: ideationGenome.generatorCount,
  ideationSourceSha256: ideationGenome.sourceSha256,
  ideationArtifactHealthy,
  expansionKernelStatus: expansionKernel.status,
  expansionLensCount: expansionKernel.lensCount,
  expansionArtifactHealthy,
  selfCompletionArtifactHealthy,
  sensoriumArtifactHealthy,
  salienceArtifactHealthy,
  missingPointers,
  missingFiles,
  automatedHourlyPathDeclared: pointerSet.has('.github/workflows/gamechanger-mesh-hourly.yml'),
  businessEffectAuthority: index.businessEffectAuthority,
  externalEffectAuthority: index.externalEffectAuthority,
  canonicalDoc: index.canonicalDoc
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!healthy) process.exitCode = 1;
