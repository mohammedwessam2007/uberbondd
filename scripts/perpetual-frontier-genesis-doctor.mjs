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

const [markdown, indexRaw, ideationIndexRaw, expansionIndexRaw] = await Promise.all([
  readFile(docPath, 'utf8'),
  readFile(indexPath, 'utf8'),
  readFile(ideationIndexPath, 'utf8'),
  readFile(expansionIndexPath, 'utf8')
]);

const index = JSON.parse(indexRaw);
const ideationIndex = JSON.parse(ideationIndexRaw);
const expansionIndex = JSON.parse(expansionIndexRaw);
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
  'tests/genesis-sovereign-expansion-kernel.test.mjs'
];

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
  index.sovereignExpansionKernel?.test
]);
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

const expansionArtifactHealthy = expansionIndex.schemaVersion === 'uberbond-sovereign-expansion-kernel-1.0.0'
  && expansionIndex.canonicalDoc === 'docs/SOVEREIGN_EXPANSION_KERNEL.md'
  && expansionIndex.module === 'src/sovereign-expansion-kernel.mjs'
  && expansionIndex.test === 'tests/genesis-sovereign-expansion-kernel.test.mjs'
  && expansionIndex.lensCount === expansionKernel.lensCount
  && expansionIndex.businessEffectAuthority === 'NONE'
  && expansionIndex.externalEffectAuthority === 'NONE';

const healthy = registry.ok
  && ideationGenome.ok
  && ideationArtifactHealthy
  && expansionKernel.ok
  && expansionArtifactHealthy
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
  missingPointers,
  missingFiles,
  automatedHourlyPathDeclared: pointerSet.has('.github/workflows/gamechanger-mesh-hourly.yml'),
  businessEffectAuthority: index.businessEffectAuthority,
  externalEffectAuthority: index.externalEffectAuthority,
  canonicalDoc: index.canonicalDoc
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!healthy) process.exitCode = 1;
