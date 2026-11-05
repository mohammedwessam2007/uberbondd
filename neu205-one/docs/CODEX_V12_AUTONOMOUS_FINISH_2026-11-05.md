# NEU205 ONE | CODEX V12 AUTONOMOUS FINISH-LINE
**Date:** 2026-11-05. **Scope:** complete Claude's unpublished v12 execution and frozen test, recover real Qwen in-app JNI, produce signed offline Android release candidate and independent medical accuracy receipt. **This public file is a code-only navigation/engineering contract, NOT a source of private study assets.**

## Mission and authority

The owner explicitly appoints **Codex as execution lead** while Claude Code is rate-limited. The owner authorizes working in the existing Codex cloud environment, inspecting and adjusting its **public-internet settings** and normal developer dependencies, and making safe, reversible **code-only** changes on the existing NEU205 feature branch. Act autonomously and preserve work. This does **not** authorize new paid API calls or purchases, sharing/uploading private course materials, modifying unrelated UberBond infrastructure, bypassing provider/org policy, silently installing an APK on a physical phone, granting Accessibility/Shizuku/root, or changing original Termux files. Keep the PR draft, never merge to main or production without distinct authority. Any service account permissions and platform approval requirements remain in force. Never disclose private keys, credentials, exams, or full textbook in logs/commits.

Read in order: repository root `AGENTS.md` and current rules, `neu205-one/docs/V12_CLAUDE_QUOTA_RECOVERY_2026-11-05.md`, `neu205-one/docs/PHOENIX_CHECKPOINT.md`, `neu205-one/docs/V11_EXECUTION_RECEIPT.md`, the current branch source and v11 CI. Current draft PR: https://github.com/mohammedwessam2007/uberbondd/pull/1605; feature branch: `neu205/codex-v11-20261104`; at 2026-11-05 checkpoint HEAD was `6b6f7d95f5f1b0fe6f2affc40605ad3c3cfe94f7`. REFRESH HEAD FIRST; this is a moving branch. Work in isolated temporary worktree and preserve all work-in-progress, especially untracked/private files. No `git clean`, `reset --hard`, unsafe force push, or blind ref overwrite.

### One-sentence purpose

On OnePlus 15 Android 17: **one Start tap → offline microphone/whisper recognition → comprehensive 299-page neuroscience book search → real Qwen medical reasoning → fast source-aware spoken answers through the phone speaker → follow-up listening → one Stop tap**. No memorized exam questions, no mandatory earbud, no separate Termux for normal UX. Speed aspirational, medical correctness and privacy verifiable.

## Stage 0. Recover the actual unpublished v12, not a fictional copy

Claude Code reported *LOCAL ONLY* commits `9437e7a`, `f5fa65d`, `2812262`, and frozen evaluation HEAD `cbf1804`. Its separate Cloud container may or may not survive. The public GitHub branch does **not** contain these commits or its private sealed results. Locate them only in accessible authorized worktrees, git bundles, local caches, uploaded or safely connected private backups. If the Claude container is inaccessible, mark `CLAUDE_PRIVATE_WORKTREE_UNAVAILABLE`, retain the public v11 state, and independently reconstruct from documented specification. **Do not assert access to a 354-row JSONL unless it exists and has been verified byte-for-byte.** Save private checkouts/patches and exact hashes before changes.

Claude's reported v12 capabilities, UNVERIFIED in public repo:
- Signed v12 APK built byte-identically twice; initial truncated hash `7f167ca7…`. Contains ~6.5 MB stripped ARM64 llama.cpp JNI library with 16 KiB-aligned segments; integrates `NativeQwen`/`NativeBrain` with original Java `EvidenceIndex`.
- Real Qwen3.5-4B GGUF host JNI test answered a supported neuroscience question, refused an out-of-book aspirin dose, and cancelled during prompt prefill in ~301 ms, host-only. Java/Flutter? The actual prior app was Java; inspect before assuming package details.
- Python v12 model-prompt and Java prompt matched byte-for-byte over 4,526 characters. Do not infer correctness solely from parity.
- Repaired verified imported corpus hash mismatch that would have blocked the user's original book on phone. Verify accepted signed provenance, not indiscriminate bypass.
- v12 prompt/gating changes, retry-on-transport-failure evaluation runner, single-model memory discipline, `--cache-ram 0` server.
- Previously attempted two commits/pushes from Claude returned GitHub 403. The **ChatGPT GitHub connector previously succeeded**, but your actual Codex credentials and repo permissions must be verified separately.

## Stage 1. Cloud environment full public internet, legitimate settings

**Owner authorization: configure broad public internet access in the Codex environment if the product allows it.** Official guide: https://learn.chatgpt.com/docs/environments/cloud-environments

For CURRENT Codex Cloud, open the environment configuration and select **Enable all public internet access**, rather than maintaining fragile per-CDN allowlists. Save and **Publish/Republish** the environment and launch a NEW TASK using that version. Existing tasks may not inherit updates. This setting does not grant private credentials, override organizational Agent Security, or bypass provider restrictions. You may use Cloud computer/UI tools already legitimately available; if only the owner can publish a configuration, prepare and validate the settings, then report ONE exact approval-only action. Do not remove enterprise policy guards or invent an API for environment settings.

Test actual network paths from the running task via HTTPS/proxy without `--noproxy`: `huggingface.co`, `us.aws.cdn.hf.co`, `cdn-lfs.huggingface.co`, `cas-bridge.xethub.hf.co`, `api.github.com`, `github.com`, `dl.google.com`, Maven Central/Gradle. A host being permitted does not equal auth or availability. Respect TLS, publisher metadata and hash pins; do not globally disable verification. Download artifacts only to a private isolated directory, never to public repository. Keep any downloaded executable, dependency, or model provenance in receipts. Don't waste sessions repeatedly retrying a provider-policy 403.

On LEGACY Codex Cloud the setting may instead be Internet access On → All (unrestricted) with its own configuration. Detect which interface exists; never assume newer UI on older sessions.

## Stage 2. Real model first, no new fake benchmarks

Already reported by Claude: `unsloth/Qwen3.5-4B-GGUF`, file `Qwen3.5-4B-Q4_K_M.gguf`, size **2,740,937,888 bytes**, LFS SHA-256 **`00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`**, GGUF architecture `qwen35`; verify actual downloaded bytes/model metadata again. Claude reported llama.cpp commit `c6a0ff1`, ~80 prompt tokens/sec, 6.5 decode tokens/sec on its four-core host; these are not Android timings. Use the source branch's verified downloader and guards. Benchmark real `answer()` path, with null SSE deltas, thinking-filter handling, token budgets, out-of-book refusal, streaming, and cancellation. If retriever has no private book, say so; synthetic passages are plumbing tests only.

Do not run two 2.7 GB models concurrently on memory-limited VM. Prior double-loading caused OOM and invalidated five baseline infrastructure rows. Keep one Qwen server, bounded prompt cache `--cache-ram 0` while measuring, health checks and bounded restarts. Preserve exact model/runtime flags and prompt hashes in receipts.

## Stage 3. Finish frozen 437 test if and only if genuine state survives

Evaluation set: **336 supported + 101 unsupported** source-grounded questions, frozen before Qwen generation. Development auto-scoring reportedly baseline **117/150**, v12 **126/150**; this is noisy preliminary DEV, not the final score. v12.1 `k=8` retrieval was **39% slower** and did not improve correctness, so it was rejected. Final v12 config frozen at local `cbf1804`.

After the first Claude container restart it independently reported **354 unique verified prediction rows out of 437**, with matching frozen question hash, one run header, two expected v12 prompt hashes and **zero** infrastructure errors recorded as medical answers. The second resume may have progressed beyond 354, but its final completion count is **UNKNOWN**.

If exact original sealed/private data exists and source is verified: (a) freeze a read-only copy and hash every file; (b) inspect existing row IDs, dates and hashes without opening the sealed key; (c) resume **only missing IDs** with identical GGUF/runtime/prompt/corpus/frozen code, one process and bounded retries; (d) quarantine ONLY independently provable transport faults; (e) when exactly 437 genuine predictions exist, seal/hash output, then independently grade blinded against original frozen key and medically review material disagreements. Never add synthetic answers to pad missing rows. Preserve historical limitations of model-authored evaluation questions and source-checked but not clinician-reviewed grading.

If the original sealed question/key/prediction bytes do NOT exist in the authorized Codex workspace, you **cannot finish THAT exact run**. Create a NEW separately sealed held-out set from the private verified textbook, with author, solver and grader isolated, and state clearly that the original run could not be recovered. Never reconstruct item-level answers or keys from the owner's narrative, and never call already-exposed questions 'new blind'. Use the 150 DEV set for further changes, then one frozen unseen evaluation. Count partial and wrong medical claims explicitly.

Release target for 437: >=**303/336** supported correct, <=**6/336** confidently wrong, >=**96/101** unsupported correctly refused. Passing thresholds are goals; no score exists until the run and independent grading complete. Do not certify clinical quality from solely agent-authored keys.

## Stage 4. Integrate and test v12 native Android Qwen

Recover/port verified native llama.cpp JNI bridge into existing `neu205-one/android`, keeping code and private artifacts separate. Use native cancellation during prompt prefill (bounded ~64-token chunks) and token generation, ensuring Stop invalidates late ASR/model/TTS outputs. Require digest-verified GGUF and textbook pack before activation; maintain rollback and existing APK signing lineage. Verify 16 KiB page alignment, model architecture, Java+JNI prompt parity, memory leaks, voice-state lifecycle, phone speaker, low-latency TTS, no network or Termux required for the preferred standalone option.

Need independent host tests with real model; reproducible signed APK and apksigner certificate check; isolated emulator/Android instrumentation where possible; zero-cost build tools; no unlimited retries on emulator boot or Maven 429. Host JNI works ≠ physical OnePlus works. The actual phone app must be explicitly authorized for install and microphone permissions; until that happens label `PHONE_NOT_TESTED`. No root, Shizuku, Accessibility, public listening ports or unwanted changes to original Termux services.

Quantify p50 and p95 for wake/endpointer/ASR/retrieval/Qwen first token/TTS first audible word, RAM, thermals and 30-turn resilience on-device; never present host latency as actual device latency. If optional 9B or Bonsai 2 27B is downloaded, compare accuracy and hardware/latency on DEV; abandon if phone RAM and response time deteriorate. Prioritize a working 4B baseline.

## Stage 5. Deliver verifiable artifacts, without babysitting

Produce **actual** Git commit/branch + draft PR #1605 code-only, no force-push or merge; source diff/secret scan, exact SHA/test logs, signed reproducible APK verified in private deliverable, model and corpus provenance, exported test scores and grading packet privately, rollback instructions, PHOENIX checkpoint for next session. If private bundles exceed attachment UI size use existing authorized private storage or small split packages; do not upload private textbook/answers/keys/weights to this public GitHub repo, issues, Actions or logs.

If network or tests require an environment owner action, first try all legitimate in-environment controls, then list at most THREE concrete, nontechnical owner-only approvals. No new spend/paid API route, no indefinite loop or unsupported 90%/phone claims. An interrupted run must leave a durable checkpoint with EXACT row count and hashes. Continue independent work during blockers.

**Your first Codex response must show an ACTUAL read-only preservation receipt and live Git SHA, then the verified access status of the frozen Claude run. It must not claim v12 source exists merely because this file describes it. Begin execution now.**

**Receipt:** This file is a verified public source-only handoff written from prior user-provided Claude logs plus live GitHub checks, not a completion claim. R02 preservation; R03 provenance; R07 sealed test falsification; R09 permissions/$0; R10 real tests; R11 durable PHOENIX; R12 truthful receipt.
