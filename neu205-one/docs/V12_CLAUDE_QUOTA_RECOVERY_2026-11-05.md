# NEU205 v12 | Claude weekly-limit PHOENIX recovery
**Prepared 2026-11-05 from the owner's verbatim Claude status report.**

This is a **public code-only recovery note**. It is not a source-code merge, not a private evaluation result, not proof the session's workspace survives, and not a release. The unpushed v12 files, sealed questions, answers, private PDF, GGUF, APK and signing keys **must not be published here**.

## Critical external-state split

The live public NEU205 branch at the time of this note was `0b6650a9a3344ecf2a3184fc8324b897ed9a3c32`, with draft PR [#1605](https://github.com/mohammedwessam2007/uberbondd/pull/1605). Recheck the live branch immediately upon resuming.

**Claude separately reported unpushed, private work.** Its source/evaluation workspace has different Git history. Reported local commits: `9437e7a` (JNI / in-process Android), `f5fa65d` (v12 prompt and refusal gate), and `2812262` (infrastructure hardening), with its frozen v12 evaluation HEAD `cbf1804`. These short IDs are *reported*, not recovered or independently verified by this public repository. **Do not claim public code contains v12 or overwrite that private work.**

## Owner goal / honest evaluation gate

One-tap offline OnePlus 15 Android 17 assistant: speak/whisper medical question about any of the original 299-page NEU205 textbook, source-aware retrieval, natural Qwen answer via built-in speaker, continued follow-up dialogue, rapid Stop. No memorized exam answers, unapproved phone actions or new spend.

Release-quality target: >=90% of **new independently medically verified book-supported** questions correct, <=2% confidently wrong, >=95% correctly declined unsupported. A previous limited-blind historical exam scored 74/120; no v12 medical accuracy claim exists. Hold-out evaluation: **437 total = 336 supported + 101 unsupported**, frozen before any solver runs. Exact final passing counts would be >=303/336 correct, <=6/336 confidently wrong, >=96/101 unsupported refusals. Provisional model-agent grades are not a licensed human medical review.

## Current unfinished run: FIRST thing to recover

Claude's status in its private session:
- Source (Qwen3.5-4B quantized GGUF) loaded and answering in private cloud. Previous LFS SHA verification reported `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`.
- Paired DEV baseline 117/150 auto-graded correct vs v12 126/150; lexical grading is noisy. DEV 40 unsupported probes: v12 had ~38 genuine refusals when grader recognized 'could not find' wording. Neither establishes held-out correctness. v12.1 increasing retrieval depth to 8 made responses **39% slower without benefit** and was rejected.
- The v12 config was frozen at **reported local HEAD `cbf1804`** and the single 437-question sealed run began. After first container restart, Claude verified **354 unique durable rows**, one run header, questions hash matching the frozen manifest, two system prompt hashes matching v12's normal/WEAK variants, zero recorded infrastructure faults, and 32 legitimate evidence-gate abstentions. Remaining 83 resumed, but a subsequent 2-hour limit killed the session and its **updated completion count is UNKNOWN**.
- Claude reported its **weekly limit resets Nov 6, 2026 at 16:00 UTC**. The original private container may be reclaimed; inspect actual disk and do not assume persistence. Do not fill in missing predictions or grades.
- An earlier broken baseline chain recorded five infrastructure failures (4 timeouts, 1 truncated stream). Those rows were quarantined/requeued; the hardened runner retries `QWEN_UNAVAILABLE` and refuses to count transport errors as answers. The real server previously OOMed while a second JNI model was loaded; new server configured with `--cache-ram 0`. **Do not launch a second model or run CPU-heavy builds concurrently.**
- After sealed predictions are complete, **freeze and hash the entire answer file before opening keys**, then perform blinded grading by four independent evaluators with source spans. Reassess ambiguous questions, clinical errors and label disagreements explicitly; never change test denominators to reach 90%. If v12 fails, that same holdout becomes exposed and must not be reused for a new 'blind' result.

## Precise safe recovery procedure in Claude Code's EXISTING private environment

1. Inspect the same private Claude workspace, process list, persistent scratch and PHOENIX. Find the **actual** eval manifests, run headers, prediction JSONL and logs by content, not guessed filename. Locate the frozen `cbf1804` commit, exact model GGUF digest, source corpus digest, system prompt hashes and signed v12 APK. Make a **private checksum backup of everything first**, including all untracked/staged files and evaluation results. No `git clean`, `reset --hard`, force push, or blind replay.
2. Verify the sealed question manifest SHA, the model identity, exact Qwen/llama.cpp version, inference template, seed/flags, `--cache-ram 0`, and clean frozen backend diff. Verify each existing answer row is unique, correctly keyed and from that frozen configuration; quarantine only provable transport failures as such, without inspecting any sealed correct answers.
3. If 437 valid predictions already exist, do not rerun. Otherwise resume **only missing IDs** via original resumable script in the same evaluation process family and frozen model+prompt. Keep a single model-server instance, bounded cache, health gates and backoff. Limit restart retries, and preserve every completed row atomically. Interrupting a run is not a rationale to relabel difficulty.
4. When there are exactly 437 valid predictions, hash/lock the answer file and audit provenance **before** opening the sealed key. Execute planned blinded grading/adjudication. Compare against target, publish only non-sensitive aggregates and calibration method; raw questions, textbook excerpts and answers remain private. No post-freeze edits to results.
5. Source changes reported as unpushed include: in-process ARM64 `llama.cpp` JNI, Java `NativeQwen`/`NativeBrain`, v12 prompt and gate, verified corpus import acceptance, 16 KiB segment-aligned ~6.5MB stripped ARM64 library, signed byte-identical APK rebuild (`7f167ca7…` truncated SHA only), native Stop during prefill measured 301ms on **host**. Each is claimed from Claude's private report and remains **unverified in public Git**. Do not claim a phone runtime from host JNI.
6. Only once recovered, reconcile remote PR #1605 changes with local v12 work in a separate worktree/branch. The connected GitHub account can make **code-only** commits when authorized. Claude reported a 403 for its own GitHub integration. If still 403, **retain private patches and reproducible Git bundle** and supply actual bytes through an approved private connector; do not put model weights, textbook, evaluation keys or signing material into public git.
7. Complete the actual signed Android offline phone qualification when permitted: no unauthorized installation/Accessibility/Termux overwrite; test whisper ASR, app-native Qwen (not fake or inaccessible server), source recall, first audible speech latency, Stop, model/corpus verification, 30-turn reliability and thermal.

## Rules / receipt

Source = **user-supplied Claude status**; repository/PR verifiable separately. This file is deliberately a durable handoff only, not execution of the 437 predictions. Applicable: R02 preserve originals, R03 evidence discipline, R07 independent evaluation, R09 $0/permissions/private-data boundary, R10 real tests, R11 PHOENIX, R12 receipt. Full 52-doctrine audit not claimed.
