# Contamination Policy

Derived from `15_CONTAMINATION_CONTROL_PROTOCOL.md` in
`UBERBOND_FABLE_FRACTION_STRATEGY_V5.zip`. This file is the operative version for
everything under `evals/v5/`; where the two ever disagree, the source protocol
wins and this file is the defect.

**Nothing in this directory is evaluator material.** No held-out fixture
mutation, answer key, hidden test, or canary exists anywhere in this repository.
The held-out and adversarial tasks carry sealed placeholder contracts that say
what a custodian must supply later. `scripts/check_contamination.py` enforces
that and fails the build if it stops being true.

## 1. Storage topology

The rule that makes the benchmark mean anything: **visible and sealed material
never share a checkout.** A hidden directory or a second branch inside this
repository is explicitly insufficient, because this repository is routinely
cloned into the very sessions being measured.

| Material | Location | May enter an executor's startup context? |
|---|---|---|
| Calibration prompts, visible fixtures, public tests, rubrics | this repository, `evals/v5/public/calibration/` | Yes |
| Calibration expected outputs and evaluator tests | benchmark branch, `.../calibration/<task_id>/evaluator/` | Intentionally visible |
| Held-out prompt template | private vault, `heldout/<task_id>/prompt/` | Only at run time |
| Held-out fixture mutation and input data | private vault, `heldout/<task_id>/fixture/` | Fixture data only, never the mutation |
| Held-out answer key, hidden tests, scoring hooks, canaries | private vault, `heldout/<task_id>/evaluator/` | **Never** |
| Configuration identity map | separate vault namespace, `identity/<campaign_id>/` | Never |
| Anonymous run outputs | append-only results store, `runs/<campaign_id>/<anon_run_id>/` | Only a session's own live output |
| Raw transcripts and tool telemetry | restricted store, `telemetry/<campaign_id>/` | Never as teacher or calibration input |
| Retired tasks | vault, `retired/<task_id>/<retirement_date>/` | Only after formal retirement |

"Private vault" means a separately permissioned, owner-controlled store that is
not cloned with UberBond and is not reachable by repository search. **This
factory does not create, modify, or contain that store.** The `vault://` strings
in the manifests and sealed contracts are non-resolving pointers naming where
material must live; they resolve to nothing today, by design.

## 2. Separation of roles

No person or model may be held-out task author, executor, and final judge for the
same task version. Where staffing cannot separate those roles, deterministic
checks decide every hard gate and the owner receives only anonymous adjudication
choices with a recommended default.

Notably: the Fable teacher never sees held-out material of any kind, and never
sees the identity map. A Work strategist judging a task may see the task-level
prompt only, and only after execution.

## 3. Campaign freeze

Before the first measured run the custodian freezes an immutable campaign
manifest: base SHA and fixture hashes; prompt, public test, hidden-test, rubric,
and canary hashes; configuration manifest hashes **but not their human-readable
names**; product-shown model and effort labels stored outside the judge packet;
tool version, lockfile hashes, container fingerprint, timezone and clock policy,
network policy; telemetry and scoring-script hashes; pre-registered run count,
randomization method, promotion gates, exclusion rules, and outage rule.

Any change after freeze creates a new campaign. Results from different task,
fixture, rubric, model, effort, container, or scorer hashes are **never silently
pooled** — that is the failure mode this whole apparatus exists to prevent.

## 4. Identity concealment and the 0.7 rule

Run labels are freshly random and are not derived from configuration order or
hashes (`scripts/create_run.py`). The identity map is sealed before judging and
opened only after deterministic outcomes, judge scores, defect severities,
disagreement resolution, and exclusions are frozen
(`scripts/seal_identity_map.py`).

**A judge that infers a configuration's identity must record the inference
before scoring.** It may continue only if its confidence is below 0.7. At 0.7 or
above the score is quarantined and a replacement blind judge is used.
`scripts/check_contamination.py --judging` fails any result set where a judge
reported confidence ≥ 0.7 without being quarantined.

## 5. Randomization

Balanced Latin-square ordering across task blocks so each configuration appears
early, middle, and late; a CSPRNG shuffles within blocks from a sealed campaign
seed. Configuration identity is never encoded in a container name, branch name,
file path, environment variable, output directory, or any label a judge can see.

Every run gets a fresh container and a clean detached checkout. No auto-memory,
package cache containing benchmark content, prior transcript, retrieval index, or
tool-output artifact may cross runs. Per-run fixture values vary from a separate
sealed seed — IDs, timestamps, ordering, harmless names, interleaving schedule,
distractor order — while acceptance semantics, risk class, allowed paths, and
rubric do not. Paired configurations within a replicate get identical
instantiated values; the seed changes between replicates.

## 6. Leakage detection

Preventive: unique non-semantic canaries in each answer-key and hidden-test
bundle, never in the prompt or executable fixture; harness denial and logging of
reads against evaluator mounts, identity-map paths, other runs' outputs,
credential stores, and vault endpoints; held-out bundles never committed,
indexed, embedded, cached, or sent to a teacher; executor egress disabled;
auto-memory and session reuse disabled for held-out runs, or the configuration is
marked ineligible.

Detective, after every run: exact and fuzzy canary matching across transcript,
tool inputs and results, diffs, generated artifacts, and final answer; file-access
log review; n-gram and AST similarity against hidden solution code; references to
unseen fixture values or answer-key wording; repository and retrieval-catalog
hash review; judge-packet scans for branding, config labels, author identity, run
order, or claimed efficiency; cross-run cache fingerprints; and anomalously exact
behavior unsupported by visible evidence — which triggers human audit but is not
by itself proof.

## 7. Incident handling

Quarantine the affected run and every later run that could share contaminated
memory, cache, or artifacts. **Do not "clean and continue" the same held-out task
version.** Preserve access logs and hashes without exposing the canary or answer
key. Mark the task `COMPROMISED`, retire it, and exclude its results from
promotion. If configuration identity reached a judge, discard that judge's scores
for the block and rejudge under new labels.

If the scope cannot be bounded, **invalidate the entire campaign.** Contamination
is a kill condition, not a scoring deduction — which is why `CONTAMINATED` is a
distinct decision in `decide_promotion.py` and is evaluated before any
merit-based verdict.

## 8. Mandatory retirement

A held-out task version is retired immediately when: its hidden material enters
any executor, teacher, strategy context, repository, search index, memory, public
artifact, or judge packet; a detector confirms or cannot safely exclude exposure;
it is used to tune prompts, hooks, skills, agents, retrieval, model selection,
thresholds, or architecture; its output is given to a teacher as a worked
example; the underlying requirement becomes obsolete; the fixture stops
reproducing or its hidden tests turn flaky; the rubric is found ambiguous after
results are seen; every eligible configuration achieves full acceptance with no
material defects across two consecutive campaigns (it no longer discriminates);
it has run in three full promotion campaigns even without detected leakage; or a
vendor training or retention policy creates unbounded exposure the owner cannot
audit.

Retirement preserves evidence: the sealed original, result hashes, reason, and
affected campaign IDs. A sanitized retired task may become calibration material,
relabeled, and never returns to held-out status.

## 9. Audit records

Append-only, hashed, timestamped records for task lifecycle, access, campaign
freeze, runs, exclusions, leaks, judge packets, score freeze, identity-map
opening, retirement, and cleanup. Unknown fields stay `null` — never an invented
zero.

The final report must state the number of quarantined tasks, retired tasks, and
excluded runs. **A clean-looking aggregate that silently drops contamination
incidents is itself invalid.**
