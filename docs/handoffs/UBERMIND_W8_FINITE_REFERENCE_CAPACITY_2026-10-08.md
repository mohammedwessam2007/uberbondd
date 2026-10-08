# UberMind Wave 8 — Reference Capacity Arithmetic Cannot Manufacture $1 Million

Date: 2026-10-08. Parent verified source main `686e4e6b116223c74aab71831d88ae6035a8035f` (Wave 7 PR #1317). Existing Render `dep-db3phvss728c73fon8f0` LIVE, native Node v26.11.1 **156/156 passed** at 2026-10-08T13:23:53.530592Z; founder source 890/890 and ten shards unchanged. This wave addresses a precise numerical trap, not a new provider or economic strategy.

## Reproducer
`src/ubermind-33k-reality-gate.mjs` `evaluateReferenceCapacityModel` accepts zero input/output USD-per-million token tariffs. The modeled maximum USD per call becomes **0**; `Math.ceil(1_000_000 / 0)` gives **Infinity**, and the function previously returned `ok:true` with an impossible required-request count. Very large individually finite tariff values multiplied by the context length likewise produce **Infinity** modeled direct USD per request, leading to a spurious minimum **1** request for one-million-dollar nominal value. Vanishingly tiny positive tariffs yield a mathematically non-representable >MAX_SAFE_INTEGER request count. Parseable non-string observedAt could also be misrepresented as a canonical catalog timestamp.

## Chosen repair
Bound modeled positive USD per call to finite values; bound theoretical request count to a positive safe integer; require a string observedAt as the catalog's source-date identity. All rejects have `ok:false`, `MODEL_CATALOG_CAPACITY_UNVERIFIED`, precise nonauthoritative reasons. Existing valid modeled hard-cap task still passes, still labeled synthetic **MODELED_ONLY** with `target33333xVerified:false`.

Competing alternatives: (a) default to Infinity as uncertainty (not a valid JSON-safe machine metric), rejected; (b) arbitrary clip at max safe integer to keep `ok:true` (would manufacture a precise cost estimate), rejected; (c) fail-closed bounded arithmetic in existing evaluator, chosen. No mutable metadata, no spend.

Four adversarial fixtures added to existing production native `tests/ubermind-33k-reality-gate.test.mjs`: free zero tariff, overflow 1e308 tariff, subnormal tiny tariff, Date-object observedAt. They are software falsifiers, not real customer demand or provider pricing.

## Preserved economics and provenance
Original moonshot donor identities `founder-moonshot-0057` Proof Economy, `-0058` Error Economy, `-0059` Prediction Accounting, `-0445` Reality Profiler, `-0653` Self-Falsifying System, `-0877` Recursion Proof System; all original 890 literal entries, ten shards and GENESIS descendants unchanged. Historic two task Sol/Opus ratios, bounded 231/231 exact-source E1, JEV tensor shadow and 16K synthetic ceiling, uncertain Haiku historical charge are not re-run or overwritten.

A request-capacity upper bound is not a real provider invoice or realistic work demand. General 33,333x target remains empirically NOT VERIFIED pending authenticated cheapest eligible task-class-specific external comparisons, blind grade, real demand and full all-in cost audit. Zero new provider model calls, zero spend, zero outreach/client messages or DNS/financial actions.

PHOENIX: `UBERMIND-W8-20261008-REFERENCE-CAPACITY-FINITE-ARITHMETIC`. On merge/deploy append exact SHA, native suite, 890 proof and external blockers to issue #1188. Do not claim a full UberMind Crown or every worldwide model is measured from these deterministic tests.
