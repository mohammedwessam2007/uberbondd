import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GENESIS_IMPLEMENTATION_EVIDENCE_VERSION = 'uberbond.genesis-implementation-evidence-1.0.0';

export const GENESIS_IMPLEMENTATION_EVIDENCE = Object.freeze({
  1: {
    name: 'Unknown-Unknown Engine', maturity: 'PARTIAL_PRIMITIVE',
    sources: ['src/perpetual-frontier-genesis.mjs'], tests: ['tests/perpetual-frontier-genesis.test.mjs'],
    runtimeReceipts: ['artifacts/perpetual-frontier-genesis-latest.json'],
    note: 'Compiles anomalies, contradictions, blind spots and disagreements into bounded research questions.'
  },
  2: {
    name: 'Artificial Serendipity Engine', maturity: 'IMPLEMENTED_PRIMITIVE',
    sources: ['src/genesis-evolution-engine.mjs'], tests: ['tests/genesis-evolution-engine.test.mjs'],
    runtimeReceipts: ['artifacts/genesis-evolution-latest.json'],
    note: 'Deterministically recombines distant cross-category opportunity mechanisms into explicitly unproven hypotheses.'
  },
  4: {
    name: 'Future-Option Portfolio', maturity: 'IMPLEMENTED_PRIMITIVE',
    sources: ['src/genesis-evolution-engine.mjs'], tests: ['tests/genesis-evolution-engine.test.mjs'],
    runtimeReceipts: ['artifacts/genesis-evolution-latest.json'],
    note: 'Ranks bounded research options using exploitation, exploration, reversibility, evidence and curiosity allocation.'
  },
  10: {
    name: 'Disagreement Mining', maturity: 'PARTIAL_PRIMITIVE',
    sources: ['src/perpetual-frontier-genesis.mjs'], tests: ['tests/perpetual-frontier-genesis.test.mjs'],
    runtimeReceipts: ['artifacts/perpetual-frontier-genesis-latest.json'],
    note: 'Preserves model/source disagreement as a research agenda instead of averaging it away.'
  },
  11: {
    name: 'Reality-Anomaly Mining', maturity: 'PARTIAL_PRIMITIVE',
    sources: ['src/perpetual-frontier-genesis.mjs'], tests: ['tests/perpetual-frontier-genesis.test.mjs'],
    runtimeReceipts: ['artifacts/perpetual-frontier-genesis-latest.json'],
    note: 'Preserves anomalies as explicit uncertainty-reduction questions.'
  },
  12: {
    name: 'Impossible-Task Ledger', maturity: 'IMPLEMENTED_PRIMITIVE',
    sources: ['src/genesis-evolution-engine.mjs', 'data/genesis/impossible-tasks.json'], tests: ['tests/genesis-evolution-engine.test.mjs'],
    runtimeReceipts: ['artifacts/genesis-evolution-latest.json'],
    note: 'Stores blocker and unlock conditions and reopens only research review when explicit conditions change.'
  },
  13: {
    name: 'Capability Multiplication Score', maturity: 'IMPLEMENTED_PRIMITIVE',
    sources: ['src/genesis-evolution-engine.mjs', 'src/thread-opportunity-universe.mjs'], tests: ['tests/genesis-evolution-engine.test.mjs'],
    runtimeReceipts: ['artifacts/genesis-evolution-latest.json'],
    note: 'Measures how broadly a new primitive touches the real stored opportunity population and category surface.'
  },
  14: {
    name: 'World Discontinuity Detector', maturity: 'IMPLEMENTED_PRIMITIVE',
    sources: ['src/genesis-evolution-engine.mjs'], tests: ['tests/genesis-evolution-engine.test.mjs'],
    runtimeReceipts: ['artifacts/genesis-evolution-latest.json'],
    note: 'Detects threshold-crossing metric changes while explicitly refusing causal claims.'
  },
  22: {
    name: 'Machine Curiosity Budget', maturity: 'PARTIAL_PRIMITIVE',
    sources: ['src/genesis-evolution-engine.mjs'], tests: ['tests/genesis-evolution-engine.test.mjs'],
    runtimeReceipts: ['artifacts/genesis-evolution-latest.json'],
    note: 'Allocates a bounded fraction of internal ranking weight to exploration/novelty without granting spend authority.'
  },
  30: {
    name: 'UBERBOND GENESIS', maturity: 'PARTIAL_PRIMITIVE',
    sources: ['src/perpetual-frontier-genesis.mjs', 'scripts/perpetual-frontier-genesis-tick.mjs'], tests: ['tests/perpetual-frontier-genesis.test.mjs', 'tests/perpetual-frontier-genesis-tick.test.mjs'],
    runtimeReceipts: ['artifacts/perpetual-frontier-genesis-latest.json'],
    note: 'Composes shockwave, resurrection, unknown-unknown and frontier-latency planning from frontier signals.'
  },
  66: {
    name: 'Surprise Score', maturity: 'IMPLEMENTED_PRIMITIVE',
    sources: ['src/genesis-evolution-engine.mjs'], tests: ['tests/genesis-evolution-engine.test.mjs'],
    runtimeReceipts: ['artifacts/genesis-evolution-latest.json'],
    note: 'Measures distance from known concepts and primitive diversity as search-priority evidence only.'
  },
  87: {
    name: 'Assumption Mutator', maturity: 'PARTIAL_PRIMITIVE',
    sources: ['src/genesis-evolution-engine.mjs', 'data/genesis/architecture-assumptions.json'], tests: ['tests/genesis-evolution-engine.test.mjs'],
    runtimeReceipts: ['artifacts/genesis-evolution-latest.json'],
    note: 'Anti-UberBond generates explicit opposite-assumption counter-theories and falsification questions.'
  },
  103: {
    name: 'Evaluator Predator-Prey Ecology', maturity: 'PARTIAL_PRIMITIVE',
    sources: ['src/genesis-evolution-engine.mjs'], tests: ['tests/genesis-evolution-engine.test.mjs'],
    runtimeReceipts: ['artifacts/genesis-evolution-latest.json'],
    note: 'Implements competing evaluator species and preserves evaluator disagreement; full co-evolution is not yet implemented.'
  },
  167: {
    name: 'Future Rival Generator', maturity: 'PARTIAL_PRIMITIVE',
    sources: ['src/genesis-evolution-engine.mjs', 'data/genesis/architecture-assumptions.json'], tests: ['tests/genesis-evolution-engine.test.mjs'],
    runtimeReceipts: ['artifacts/genesis-evolution-latest.json'],
    note: 'Anti-UberBond generates architecture challengers from changed primitives; autonomous rival implementation is not yet present.'
  },
  174: {
    name: 'Founder Freedom Derivative', maturity: 'IMPLEMENTED_PRIMITIVE',
    sources: ['src/genesis-evolution-engine.mjs'], tests: ['tests/genesis-evolution-engine.test.mjs'],
    runtimeReceipts: [],
    note: 'Scores founder-minute reduction, reversibility, optionality, lock-in risk and recurring leverage as decision support.'
  },
  175: {
    name: 'GENESIS²', maturity: 'PARTIAL_PRIMITIVE',
    sources: ['src/genesis-evolution-engine.mjs', 'scripts/genesis-evolution-tick.mjs'], tests: ['tests/genesis-evolution-engine.test.mjs', 'tests/genesis-evolution-tick.test.mjs'],
    runtimeReceipts: ['artifacts/genesis-evolution-latest.json'],
    note: 'Adds a second evolution layer over GENESIS: serendipity, portfolio selection, assumption attack and evaluator competition. Self-rewriting evolution algorithms are not yet implemented.'
  },
  183: {
    name: 'Counter-Theory Generator', maturity: 'PARTIAL_PRIMITIVE',
    sources: ['src/genesis-evolution-engine.mjs', 'data/genesis/architecture-assumptions.json'], tests: ['tests/genesis-evolution-engine.test.mjs'],
    runtimeReceipts: ['artifacts/genesis-evolution-latest.json'],
    note: 'Generates explicit counter-theories against registered architecture assumptions.'
  }
});

function envelope(extra = {}) {
  return {
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

export function parseGenesisRegistry(markdown) {
  return [...String(markdown || '').matchAll(/^(\d+)\.\s+(.+)$/gm)].map(match => ({ id: Number(match[1]), name: match[2].trim() }));
}

export function buildGenesisEvidenceLedger({ canonicalMarkdown, availablePaths = [], observedRuntimeReceipts = [] } = {}) {
  const registry = parseGenesisRegistry(canonicalMarkdown);
  if (registry.length !== 275) return envelope({ ok: false, status: 'GENESIS_EVIDENCE_LEDGER_INVALID', reasonCodes: ['canonical-275-registry-required'], observedCount: registry.length });
  const paths = new Set(Array.isArray(availablePaths) ? availablePaths : []);
  const runtime = new Set(Array.isArray(observedRuntimeReceipts) ? observedRuntimeReceipts : []);
  const reasonCodes = [];
  for (const [rawId, evidence] of Object.entries(GENESIS_IMPLEMENTATION_EVIDENCE)) {
    const id = Number(rawId);
    const registryIdea = registry.find(item => item.id === id);
    if (!registryIdea || registryIdea.name !== evidence.name) reasonCodes.push(`evidence-name-mismatch:${id}`);
  }
  if (reasonCodes.length) return envelope({ ok: false, status: 'GENESIS_EVIDENCE_LEDGER_INVALID', reasonCodes });

  const entries = registry.map(idea => {
    const evidence = GENESIS_IMPLEMENTATION_EVIDENCE[idea.id];
    if (!evidence) return { id: idea.id, name: idea.name, maturity: 'CANON_ONLY', status: 'CANON_ONLY', sources: [], tests: [], runtimeReceipts: [], missingPaths: [] };
    const missingSources = evidence.sources.filter(item => !paths.has(item));
    const missingTests = evidence.tests.filter(item => !paths.has(item));
    const presentRuntime = evidence.runtimeReceipts.filter(item => runtime.has(item));
    let status = 'DECLARED_EVIDENCE_MISSING';
    if (!missingSources.length && !missingTests.length) status = presentRuntime.length ? 'OBSERVED_INTERNAL_RUNTIME_RECEIPT' : 'SOURCE_AND_TEST_PRESENT';
    return {
      id: idea.id,
      name: idea.name,
      maturity: evidence.maturity,
      status,
      sources: evidence.sources,
      tests: evidence.tests,
      runtimeReceipts: presentRuntime,
      missingPaths: [...missingSources, ...missingTests],
      note: evidence.note
    };
  });
  const counts = entries.reduce((acc, entry) => { acc[entry.status] = (acc[entry.status] || 0) + 1; return acc; }, {});
  const maturityCounts = entries.reduce((acc, entry) => { acc[entry.maturity] = (acc[entry.maturity] || 0) + 1; return acc; }, {});
  return envelope({
    ok: true,
    status: 'GENESIS_EVIDENCE_LEDGER_READY',
    ideaCount: 275,
    counts,
    maturityCounts,
    entries,
    implementedOrPartialCount: entries.filter(entry => entry.maturity !== 'CANON_ONLY').length,
    canonOnlyCount: entries.filter(entry => entry.maturity === 'CANON_ONLY').length,
    truthBoundary: 'SOURCE_AND_TEST_PRESENT_DOES_NOT_MEAN_TESTS_PASSED; OBSERVED_INTERNAL_RUNTIME_RECEIPT_DOES_NOT_MEAN_EXTERNAL_VALUE_PROOF; CANON_ONLY_MUST_NOT_BE_CALLED_IMPLEMENTED'
  });
}
