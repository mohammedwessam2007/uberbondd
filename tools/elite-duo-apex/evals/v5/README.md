# V5 Benchmark Operations Factory

Deterministic, contamination-resistant machinery for comparing operating-system
configurations on UberBond work. Built from
`UBERBOND_FABLE_FRACTION_STRATEGY_V5.zip` at base commit
`967446bdf13f39e6ba9ad799908dc93534b92d1c`.

## What this is, and what it deliberately is not

**It is** the registry, schemas, packets, protocols, and scripts needed to run a
blind benchmark campaign and reach a defensible promotion decision.

**It is not** a benchmark that has been run. No task has been executed, no run
record exists, no configuration has been measured, and no promotion decision has
been made. Nothing here contacts anything external.

**It contains no evaluator material.** The four held-out and two adversarial
tasks carry *sealed placeholder contracts* — declarations of what a vault
custodian must supply later. No answer key, hidden test, fixture mutation, or
canary is present, and none may ever be committed here, because this repository
is cloned into the sessions being measured.

## Layout

```
BENCHMARK_REGISTRY.json      authoritative index of exactly 12 tasks
manifests/                   one manifest per task (evaluator-side view)
public/calibration/          executor packets, 6 calibration tasks
public/heldout/              executor packets, 4 held-out tasks
public/adversarial/          executor packets, 2 adversarial tasks
heldout/                     sealed placeholder contracts (no hidden material)
adversarial/                 sealed placeholder contracts (no hidden material)
calibration/                 calibration evaluator workspace (visible by design)
fixtures/                    fixture staging; real fixtures live in the vault
schemas/                     4 JSON Schema draft-07 contracts
scorers/                     scorer configuration
telemetry/runs/              append-only run records
anonymization/               identity map and its sealed commitment
reports/                     judge packets, judge results, promotion decisions
scripts/                     9 factory scripts + a vendored schema validator
tests/                       self-tests over synthetic fixtures only
```

## The 12 tasks

Taken verbatim from `13_BENCHMARK_TASK_BANK.md` and cross-checked against
`14_BENCHMARK_MANIFEST.csv`. Nothing was added, removed, renumbered, merged, or
reworded.

| Class | Count | IDs | Scorable today |
|---|---:|---|---|
| Calibration | 6 | `CAL-UB-01` … `CAL-UB-06` | yes |
| Held-out | 4 | `HLD-UB-01` … `HLD-UB-04` | no — awaiting vault material |
| Adversarial | 2 | `ADV-UB-01`, `ADV-UB-02` | no — awaiting vault material |

Task IDs are permanent. A task is retired with a retirement note, never
renumbered or reused. Changing an objective, acceptance criterion, or fixture
requires a new `fixture_version` and invalidates prior runs of that task.

## Protocols

| Document | Answers |
|---|---|
| `CONTAMINATION_POLICY.md` | where material lives, who may see it, what voids a campaign |
| `ANONYMIZATION_PROTOCOL.md` | how runs stay unattributable through judging |
| `EXECUTOR_PROTOCOL.md` | what a measured session receives and may do |
| `JUDGE_PROTOCOL.md` | how a blind judge scores, and the 10-dimension hierarchy |
| `CLEANUP_PROTOCOL.md` | disposable worktrees and proving nothing was left behind |
| `FABLE_PACKET_BUILDER_SPEC.md` | the future evidence packet — spec only, not built |

## Scripts

```
validate_factory.py        is the factory internally coherent?
check_contamination.py     is any evaluator material committed? are judges blind?
check_cleanup.py           did a run leave residue?
create_run.py              open an anonymous run record, every field null
seal_identity_map.py       commit to the label->config mapping before judging
build_executor_packet.py   manifest -> public packet (hidden fields stripped)
build_judge_packet.py      run + manifest -> blind judge packet
score_run.py               rank runs under the lexicographic hierarchy
decide_promotion.py        gates -> one of exactly four decisions
```

`_minischema.py` is a dependency-free draft-07 subset validator: this must work
in a fresh container with no network and no `pip install`. It refuses to validate
against a schema using a keyword it does not implement, so a future schema edit
cannot silently turn validation off.

## Scoring, in one paragraph

Ten dimensions, compared strictly in order: prohibited external action →
protected-path violation → critical defects → acceptance failure → material
defects → owner burden → repair count → elapsed time → fresh tokens → measured
cost. **Cost is last on purpose.** A cheaper run can never compensate for a
critical defect, because the comparison is decided long before it reaches cost.
Dimensions 1–5 may not be null; if the first dimension separating two runs is
null, the answer is `INSUFFICIENT_EVIDENCE`, not a guess.

## Promotion vocabulary — exactly four

```
CONTAMINATED           evidence integrity failed; the comparison is void
INSUFFICIENT_EVIDENCE  a gate could not be determined
PROMOTE                all nine gates satisfied
REJECT                 all gates determined, at least one failed
```

Evaluated in that order. A contaminated campaign is never rejected "on the
merits" — that would imply the numbers meant something. An undetermined gate is
never read as a pass. There is no fifth outcome and no override flag; a campaign
that wants a different answer must produce different evidence.

`PROMOTION_DECISION.schema.json` enforces this structurally: a document with
`decision: PROMOTE` and any gate not `true` fails its own schema.

## Running the checks

```
python3 scripts/validate_factory.py
python3 scripts/check_contamination.py --repo
python3 -m unittest discover -s tests -t tests -v
```

All three are read-only, run offline, execute no benchmark task, and touch no
product code.

## Telemetry honesty

Every field in `RUN_RECORD.schema.json` is nullable. A harness that cannot
measure something writes `null` and names the field in `unknown_fields`. **A
fabricated zero is worse than a missing value** — a zero enters aggregates
silently and a null does not. `measured_cost_usd` is set only from a genuine
product-reported figure; it is never inferred from token counts.
