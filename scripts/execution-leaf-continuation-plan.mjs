#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileExecutionLeafContinuation, buildExecutionLeafContinuationCheckpoint } from '../src/execution-leaf-continuation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith('--')) continue;
  const value = process.argv[i + 1];
  args.set(token, value && !value.startsWith('--') ? process.argv[++i] : true);
}

const graphPath = resolve(root, String(args.get('--graph') || 'artifacts/sovereign/canonical-execution-leaf-graph.json'));
const outputPath = resolve(root, String(args.get('--output') || 'artifacts/sovereign/execution-leaf-continuation-plan.json'));
const maxAttempts = args.get('--max-attempts') == null ? 3 : Number(args.get('--max-attempts'));

try {
  const graph = JSON.parse(await readFile(graphPath, 'utf8'));
  const compiled = compileExecutionLeafContinuation({ graph, maxAttempts });
  if (!compiled.ok) {
    console.error(JSON.stringify(compiled, null, 2));
    process.exitCode = 2;
  } else {
    const checkpoint = buildExecutionLeafContinuationCheckpoint({ graph, state: compiled.state });
    if (!checkpoint.ok) {
      console.error(JSON.stringify(checkpoint, null, 2));
      process.exitCode = 2;
    } else {
      const artifact = {
        schemaVersion: 'uberbond.execution-leaf-continuation-plan.v1',
        generatedFromSourceCommit: graph.sourceCommit,
        graphDigest: graph.graphDigest,
        state: compiled.state,
        checkpoint: checkpoint.checkpoint,
        runnableLeafIds: compiled.state.runnableLeafIds,
        resourceLaw: compiled.resourceLaw,
        networkCalls: 0,
        providerCalls: 0,
        executionAuthority: 'NONE',
        businessEffectAuthority: 'NONE'
      };
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
      console.log(JSON.stringify({
        ok: true,
        status: 'EXECUTION_LEAF_CONTINUATION_PLAN_WRITTEN',
        sourceCommit: graph.sourceCommit,
        runnableLeaves: artifact.runnableLeafIds.length,
        output: outputPath,
        networkCalls: 0,
        providerCalls: 0,
        executionAuthority: 'NONE',
        businessEffectAuthority: 'NONE'
      }, null, 2));
    }
  }
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    status: 'EXECUTION_LEAF_CONTINUATION_PLAN_REFUSED',
    reasonCodes: [String(error?.message || error).slice(0, 300)],
    networkCalls: 0,
    providerCalls: 0,
    executionAuthority: 'NONE',
    businessEffectAuthority: 'NONE'
  }, null, 2));
  process.exitCode = 2;
}
