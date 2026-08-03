# Anonymization Protocol

Grounded in `15_CONTAMINATION_CONTROL_PROTOCOL.md` §4 and
`16_FABLE_EVIDENCE_PACKET_CONTRACT.md` §5.

The purpose is narrow and worth stating plainly: a judge who knows which
configuration produced a run will score the configuration, not the run. Every
mechanism below exists to keep that knowledge out of the judging path until the
scores are frozen.

## 1. Run labels

* The harness generates a fresh random `anon_run_id` per task / configuration /
  replicate. `scripts/create_run.py` uses `secrets` and an alphabet with no
  look-alike characters.
* Labels are **not** derived from configuration order, configuration hash, or
  run index. `run-a3k9pq` tells a judge nothing.
* Labels are never reused. `create_run.py` refuses to overwrite an existing run
  file, and `seal_identity_map.py --add` refuses a duplicate label.

## 2. What the run record may contain

The run record (`schemas/RUN_RECORD.schema.json`) is the *harness's* record and
does hold `config_hash`, model, effort, tokens, and cost. It is not judge-facing.

`config_hash` is an opaque configuration-manifest hash. The **human-readable
configuration name never enters any file under this directory** — not in the run
record, not in a filename, not in a directory name.

## 3. What a judge receives

`scripts/build_judge_packet.py` projects a run record and its manifest into a
judge packet. These fields are stripped and the stripping is asserted, not
assumed:

```
config_hash, actual_session_model, actual_effort_level,
fresh_input_tokens, cache_write_tokens, cache_read_tokens, output_tokens,
measured_cost_usd, start_time, end_time, compaction_count
```

Timings and token counts are removed alongside the obvious identifiers because
they are strong identity signals — a judge who sees "12% fewer input tokens"
knows which arm it is looking at.

A judge receives: the task statement and rubric, the anonymous label,
deterministic test outcomes, the anonymous diff or output, and cited causal
excerpts. A judge does not receive: startup instructions, the identity map,
token-savings claims, run order, or branch names that reveal configuration.

## 4. Sanitization rules

* Strip comments, filenames, status lines, and prompt headers that reveal
  architecture identity — **unless the text itself is the defect being judged**,
  in which case replace with a neutral stable token and record the
  transformation hash.
* Remove architecture names (`V4`, `V5`, "plain", teacher names), provider and
  model branding, author identity, and claimed savings.
* Rebase diffs onto the common task fixture; normalize metadata only.
* **Preserve semantic code and test outcomes.** Do not normalize away defects and
  do not make candidates artificially similar — an anonymizer that erases the
  difference being measured has destroyed the experiment, not protected it.
* Scan the assembled packet for canaries, configuration-name dictionary entries,
  secrets, real address or URL patterns, unsupported performance adjectives, and
  forbidden-path content. Any hit blocks submission.

## 5. Sealing and opening the map

```
seal_identity_map.py --add <anon_run_id> <config_hash>   # during run creation
seal_identity_map.py --seal                              # once, before judging
seal_identity_map.py --verify                            # after scores freeze
```

Sealing writes a commitment file containing a SHA-256 over the canonical mapping
plus run and configuration counts — **and no mapping**. After sealing, `--add` is
refused.

`--verify` re-hashes the working map and compares. A mismatch proves the mapping
changed during judging, which invalidates the comparison. This is the mechanism
by which the owner can later prove nobody re-labelled runs to flatter an arm; it
is worth running even when nothing seems wrong.

The map is opened only after deterministic outcomes, judge scores, defect
severities, disagreement resolution, and exclusions are signed and frozen.

## 6. Judge self-reported identity inference

A judge that believes it has identified a configuration records the inference
**before** scoring, as `identity_inference` in
`schemas/JUDGE_RESULT.schema.json`:

* confidence below 0.7 — scoring continues, inference retained in the record;
* confidence 0.7 or above — the result is **quarantined** and a replacement blind
  judge scores the run.

`scripts/check_contamination.py --judging` fails any result set containing a
confidence ≥ 0.7 that was not quarantined. Honest self-reporting is cheap;
discovering after promotion that a judge knew the answer is not.
