# Fable Packet Builder — Specification

Specification only. **Fable was not invoked during this mission, no credit was
consumed, and no performance claim was created.** No builder implementation
exists in this directory, deliberately: building one before the eligibility
preconditions hold would invite running it.

Grounded in `16_FABLE_EVIDENCE_PACKET_CONTRACT.md`.

## 1. Eligibility — all five, before a packet may be assembled

1. connected GitHub still resolves `setup/fable-fraction-v4` to the intended
   verified commit;
2. the repaired fresh-container test has run against exact SHA
   `967446bdf13f39e6ba9ad799908dc93534b92d1c` and its raw evidence is available;
3. the Work strategy, static-context measurement method, benchmark task and
   fixture hashes, scorer, and plain baseline results are frozen;
4. the Fable trigger in `06_FABLE_CREDIT_POLICY.md` is satisfied by a recurrent
   material failure or a high-risk final adjudication need;
5. held-out answer keys, hidden tests, configuration identity, and canaries
   remain sealed.

If the fresh-container test fails, the first packet may ask only for a bounded
repair verdict after the failure is deterministically reproduced. It may not
present V4 as repaired or proceed to V5 quality claims.

## 2. Hard size envelope — the packet is rejected before submission if exceeded

| Dimension | Target | Hard maximum |
|---|---:|---:|
| Total files | 8 | **10** |
| Natural-language words | 5,000 | **7,500** |
| Approximate submitted context | 8,000 tokens | **12,000 tokens** |
| Raw log excerpts | 0 | **150 lines / 12 KiB total** |
| Code and diff excerpts | 3 | **6 excerpts, 60 lines each, 300 lines, 30 KiB** |
| Benchmark tables | 2 | **2 tables, 18 data rows, 14 columns each** |
| Contradiction rows | 8 | **15** |
| Critical failures | 3 | **7** |
| Unresolved decisions | 3 | **7** |
| Requested verdicts | 1 | **1** |

Directories and archives are forbidden. Context is estimated with one named,
versioned estimator and reported as an estimate — never as billing precision.

When evidence does not fit, the builder **narrows the requested verdict** or
replaces excerpts with immutable references and hashes. It never expands the
packet and never asks Fable to read the repository.

## 3. The ten files

| File | Required | Cap |
|---|---|---|
| `00_PACKET_MANIFEST.json` | yes | 250 words-equivalent / 4 KiB |
| `01_ARCHITECTURE_ONE_PAGE.md` | yes | 900 words, ≤8-node diagram |
| `02_STATIC_CONTEXT_MEASUREMENTS.json` | yes | 8 KiB |
| `03_SELECTED_DIFFS.patch` | normally | 6 excerpts / 300 lines / 30 KiB |
| `04_CONTRADICTION_LEDGER.csv` | yes | 15 data rows |
| `05_BASELINE_RESULTS.csv` | yes | 18 rows / 14 columns |
| `06_CANDIDATE_RESULTS.csv` | yes | 18 rows / 14 columns |
| `07_CRITICAL_FAILURES.md` | if any exist | 7 failures / 1,000 words |
| `08_UNRESOLVED_DECISIONS.md` | yes | 7 decisions / 700 words |
| `09_REQUESTED_VERDICT.md` | yes | 400 words |

Optional files are **omitted**, not replaced with background prose.

Results CSV columns (both baseline and candidate):

```
anonymous_config_id,task_id,replicates,acceptance_passes,critical_defects,
material_defects,owner_interventions,repair_cycles,fresh_input_tokens,
cache_read_tokens,output_tokens,compactions,elapsed_seconds,evidence_hash
```

Missing product telemetry is `null`, never zero. Exactly one candidate is
included — not both V4 and V5 "for completeness".

## 4. Mandatory exclusions

Corpus and catalog dumps, repository-wide search results; repeated background
prose and resolved contradictions; synthetic fixtures or results presented as
measurements; model and provider branding, architecture nicknames, "thinks like"
claims; human-readable configuration names, identity maps, run order, author
identity, claimed token savings in judge-facing files; held-out fixture
mutations, answer keys, hidden tests, canaries, distinctive solution code, or
teacher examples derived from held-out output; irrelevant raw logs, full
transcripts, stack traces, cache dumps, tool chatter; unsupported conclusions,
production-readiness claims, invented token-to-credit conversions, estimates
labeled as measurements, zeroes substituted for unknowns; credentials, secrets,
environment files, customer or prospect identifiers, real recipient data, payment
details, production URLs or data, repository tokens; any live outbound, payment,
deployment, DNS, KYC, purchase, contact, or repository-write instruction; more
than one candidate architecture for the requested verdict.

## 5. Allowed verdicts — exactly one per packet

Teacher phase:

```
TEACH_UP_TO_THREE_TESTABLE_REPAIRS
NO_MATERIAL_TEACHING_NEEDED
INSUFFICIENT_EVIDENCE
```

Final-judge phase:

```
PROMOTE_V5
REPAIR_AND_RERUN_CALIBRATION
ROLL_BACK_TO_PLAIN
INCONCLUSIVE
```

Fable is never asked to decide owner identity, purchases, deployment, merge,
credentials, payments, DNS, KYC, or live outbound. Those stay owner-controlled
and outside the packet entirely.

## 6. Assembly procedure a future builder must implement

1. reverify branch and commit through connected GitHub; record the comparison
2. confirm the fresh-container result is for exact `967446…`; keep the old
   `859c1ed…` report only as a contradiction row
3. select one phase and one requested verdict
4. pull only frozen, hashed evidence fields — never summarize from memory
5. build at most ten files in a new empty directory, with **no repository
   checkout and no vault mount**
6. apply every cap; replace surplus with immutable references
7. run schema, hash, secret, canary, branding, identity, unsupported-claim, and
   exclusion scans
8. have an independent custodian verify every claim maps to included evidence and
   that held-out answers and configuration identities are absent
9. freeze the packet hash — any edit is a new version and invalidates the prior
   response for decision use
10. record product-shown effort and consumed credits **after** the session; never
    predict or convert them beforehand

## 7. Response contract

At most 1,500 words plus one decision table: exactly one allowed verdict;
supporting and contradicting evidence IDs; critical and material defects with
confidence; at most three testable recommendations, each with a deterministic
test, maximum scope, owner approval boundary, and deletion condition; explicit
unknowns; and whether a second session is justified.

A second session is permitted only when the first returns `INSUFFICIENT_EVIDENCE`
for a named missing artifact, or an independent review is needed for a high-risk
disagreement. It receives only the missing evidence plus the prior response hash,
under the same envelope.

**Fable output is advice, not proof.** A recommendation becomes an implementation
only after a deterministic test is written for it. Narrative recommendations that
cannot become tests are rejected and consume no further repair cycle.

## 8. Current status

Do not assemble or send a packet. Wait for the repaired fresh-container result at
exact `967446…`, freeze the fixtures and scorer, and obtain the plain baseline.
Invoke one bounded teacher session only if a recurrent material calibration
failure remains; otherwise skip to the implementation and benchmark gates and
spend no credits. Deployment and merge readiness remain conditional and unproven.
