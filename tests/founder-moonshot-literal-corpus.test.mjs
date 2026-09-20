import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFounderMoonshotAtomizationQueue,
  loadFounderMoonshotLiteralCorpus,
  validateFounderMoonshotLiteralCorpus
} from '../src/founder-moonshot-literal-corpus.mjs';

test('founder moonshot literal corpus is exactly 890 contiguous source entries', async () => {
  const corpus = await loadFounderMoonshotLiteralCorpus();
  const result = validateFounderMoonshotLiteralCorpus(corpus);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'FOUNDER_MOONSHOT_CORPUS_EXACT_890_OF_890');
  assert.equal(result.counts.expected, 890);
  assert.equal(result.counts.recovered, 890);
  assert.equal(result.counts.shards, 10);
  assert.equal(result.counts.missingIq, 0);
  assert.equal(result.counts.emptyBodies, 0);
  assert.equal(result.counts.duplicateOrdinals, 0);
});

test('literal duplicate title is preserved rather than silently merged', async () => {
  const corpus = await loadFounderMoonshotLiteralCorpus();
  const result = validateFounderMoonshotLiteralCorpus(corpus);
  const duplicate = result.duplicateTitles.find(row => row.title === 'THE ONTOLOGICAL SINGULARITY');
  assert.deepEqual(duplicate?.ordinals, [625, 683]);
  assert.match(result.noDropLaw, /REMAIN_DISTINCT/);
});

test('first and last source identities are preserved', async () => {
  const corpus = await loadFounderMoonshotLiteralCorpus();
  assert.equal(corpus.entries[0].ordinal, 1);
  assert.equal(corpus.entries[0].literalTitle, 'THE CAUSAL COMPILER');
  assert.equal(corpus.entries[0].stableId, 'founder-moonshot-0001');
  assert.equal(corpus.entries.at(-1).ordinal, 890);
  assert.equal(corpus.entries.at(-1).literalTitle, 'THE MYTHIC VERSION OF UBERBOND');
  assert.equal(corpus.entries.at(-1).stableId, 'founder-moonshot-0890');
});

test('atomization queue covers every source entry exactly once', async () => {
  const corpus = await loadFounderMoonshotLiteralCorpus();
  const queue = buildFounderMoonshotAtomizationQueue(corpus, { batchSize: 25 });
  assert.equal(queue.ok, true);
  assert.equal(queue.sourceEntryCount, 890);
  assert.equal(queue.batchCount, 36);
  const ids = queue.batches.flatMap(batch => batch.stableIds);
  assert.equal(ids.length, 890);
  assert.equal(new Set(ids).size, 890);
  assert.equal(queue.batches[0].ordinalStart, 1);
  assert.equal(queue.batches.at(-1).ordinalEnd, 890);
  assert.match(queue.transformationBoundary, /LITERAL_SOURCE_TEXT_IS_IMMUTABLE/);
});
