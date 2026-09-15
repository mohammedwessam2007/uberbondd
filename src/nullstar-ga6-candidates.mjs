// GA6 candidates: GA5's, unchanged, under a comparison rule that can see the gate.
//
// GA5 did not fail because of its candidates. Three of them scored 1.0
// in-distribution and passed the out-of-pattern gate 3 of 3, and lost to a rule
// that compared only the number they tied on. Editing them now would confound
// the comparison change with a candidate change, and neither effect could then
// be attributed to anything.
//
// So this file re-exports them byte for byte. The null candidate is the same
// one that has run in every generation since GA4.

export const NULLSTAR_GA6_CANDIDATES_VERSION = 'uberbond.nullstar-ga6-candidates.v1';

import { j1OneMorePattern } from './nullstar-ga4-candidates.mjs';
import { k2OperatorRepaired, k3CompositionalStrict, k4StructuralParse } from './nullstar-ga5-candidates.mjs';

export const GA6_CANDIDATES = Object.freeze({
  L1_ONE_MORE_PATTERN: j1OneMorePattern,
  L2_OPERATOR_REPAIRED: k2OperatorRepaired,
  L3_COMPOSITIONAL_STRICT: k3CompositionalStrict,
  L4_STRUCTURAL_PARSE: k4StructuralParse
});
