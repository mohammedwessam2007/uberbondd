import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFounderMoonshotAtomizationQueue,
  loadFounderMoonshotLiteralCorpus,
  validateFounderMoonshotLiteralCorpus
} from '../src/founder-moonshot-literal-corpus.mjs';

test('literal shards retain 890 contiguous entries; original source integrity remains a separate gate', async () => {
  const corpus = await loadFounderMoonshotLiteralCorpus();
  const result = validateFounderMoonshotLiteralCorpus(corpus);
  // Shard completeness never repairs a truncated original transcript.
  const sourceMatches = corpus.rawSourceSha256 === corpus.manifest.source.sha256;
  assert.equal(result.ok, sourceMatches);
  assert.deepEqual(result.errors.filter(e => !e.startsWith('raw-source-sha-mismatch:')), []);
  if (!sourceMatches) assert.equal(result.truthClass, 'RECOVERY_INTEGRITY_BLOCKED_NOT_CURRENT_AUTHORITY');
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

test('atomization blocks corrupt original evidence and covers each entry only when integrity closes', async () => {
  const corpus = await loadFounderMoonshotLiteralCorpus();
  const queue = buildFounderMoonshotAtomizationQueue(corpus, { batchSize: 25 });
  if (!validateFounderMoonshotLiteralCorpus(corpus).ok) {
    assert.equal(queue.ok, false);
    assert.equal(queue.status, 'FOUNDER_MOONSHOT_ATOMIZATION_QUEUE_BLOCKED');
    assert.ok(queue.reasonCodes.some(r => r.startsWith('raw-source-sha-mismatch:')));
    return;
  }
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
