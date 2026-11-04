# NEU205 ONE | Claude Code zero-context recovery (PUBLIC, SOURCE-ONLY)

**Status:** Engineering continuation, not a medically validated or phone-tested release. This is a safe public navigation document. It deliberately does NOT contain private course text, exam answer keys, audio, model weights, pairing keys, APK signing materials, or the 109 MB owner-private archive.

## First 60 seconds: read live truth

- Canonical repository: `mohammedwessam2007/uberbondd`
- **Active source branch:** `neu205/codex-v11-20261104`
- **Draft integration PR:** https://github.com/mohammedwessam2007/uberbondd/pull/1605
- Source tree: https://github.com/mohammedwessam2007/uberbondd/tree/neu205/codex-v11-20261104/neu205-one
- Historical Claude reasoning/retrieval donor: `ccr-62ebe621-64xxfa` (read and compare; do not assume latest)
- **Live branch SHA and PR state must be reverified before edits.** Never overwrite or reset a concurrent worker's changes.
- Check `AGENTS.md`, repository operating guidance, `neu205-one/`, its `docs/`, `tools/`, `receipts/`, and the latest PHOENIX handoff before proceeding.
- Use a clean worktree, preserve original app code and archived v6/v8 assets. Do not modify unrelated UberBond systems. Keep the PR draft until qualified.

## Founder objective

Build **one extremely simple, fully offline, hands-free conversational neuroscience assistant** on **OnePlus 15 / Android 17**. One Start tap, natural spoken/whispered medical questions about ANY content in the user's **299-page text-only NEU205 department book**, immediate accurate *spoken* answers, natural follow-ups, one Stop tap. Phone speaker first, Bluetooth earbud later. No recurring paid APIs, no required Termux command/port/key for normal use. Optimize real end-of-speech -> first audible correct word (warm target <= 2.5 s, aspirational, not yet established) while refusing unsupported or uncertain statements.

**The exam paper is a blind evaluation only, not a memorization/lookup answer table.** No exam questions or answer keys in runtime or training. Accuracy from actual model reasoning over verified complete textbook evidence, not a hard-coded extractive responder. No 100% / zero-latency promise.

Architecture candidates: source-linked hierarchical full-book index / predictive keyword-first lookup / source-preserving page-window expansion / BM25 plus BGE-small dense fusion; optionally ColBERT/compact reranking when end-to-end accuracy and phone latency justify. Select experimentally, not by fashion. Qwen should be the actual answer generator, cite exact page/source, respect negation/relationships, and expose conflicts. Keep short, verified evidence in context and reuse stable prefix/KV where supported.

## What is already real versus not

- PR #1605 contains v11 code; the dedicated **NEU205 code-only validation** CI has passed on recent heads. Whole-repo unrelated CI failures do not independently establish NEU205-specific failure.
- Previous work reported a signed v11 candidate APK, reproducible build, passing source/framework tests, signed course import, and rollback. **Those are reports from prior workspace, not evidence that an APK is installed or usable on this phone.**
- Historical Qwen3.5-4B retrieval+answer result **74/120** on a limited-blind, post-exposure exam; separate held-out medical questions had serious confidently-wrong answers. This is NOT a new v11 score, clinically acceptable performance, or phone speed.
- NEU205 v11 new medical accuracy: **NOT MEASURED**. Physical phone mic -> ASR -> Qwen -> TTS, offline mode, real sound latency, and thermal endurance: **NOT TESTED**.
- Source/Model custody: private original book, exams, evaluation keys, embedding vectors, some saved APKs and originals are NOT in this public GitHub repository. Never infer their absence from this branch means they do not exist.

## Private backup recovery WITHOUT uploading to public GitHub

The exact owner-private ZIP is named `NEU205_ZERO_CONTEXT_COMPLETE_BACKUP_2026-11-04.zip` (109,206,693 bytes; source custody is in the user's ChatGPT Library folder `/NEU205_Backups/Zero_Context_Claude_2026-11-04/` and the originating ChatGPT conversation). It contains:
- `00_CONTROL/00_START_HERE.md` and `00_CONTROL/01_CLAUDE_CODE_EXECUTE.md`
- `02_ORIGINAL_BACKUPS/NEU205_CODEX_V11_MASTER_AND_SOURCE_2026-11-04.zip`
- `02_ORIGINAL_BACKUPS/NEU205_CODEX_V11_PRIVATE_EVIDENCE_A_2026-11-04.zip` (PRIVATE book/exam)
- `02_ORIGINAL_BACKUPS/NEU205_CODEX_V11_PRIVATE_RECOVERY_B_2026-11-04.zip` (PRIVATE historical donors)
- SHA-256 per-entry manifest and verification script; historical research/context files.

**This archive is NOT accessible through public GitHub; Claude Code must not invent access to it.** First inspect any actual existing Claude Code private workspace/cached assets and the previously reported `/workspace/NEU205-v11-private-delivery.zip` location, verifying files by SHA if present. If not present, continue lawful source-only work; request only a *private authorized transfer method* for indispensable missing bytes. Don't publish them in Git, PRs, releases, issues, Actions artifacts, log output, or public model hubs. A public repo branch is public even if it is named private.

## Highest-value immediate execution

1. **Verify Hugging Face reachability in the actual Claude Cloud container**, including CDN/Xet redirects under permitted network policy. Check for a cached exact GGUF before downloading. Never work around explicitly denied hosts or use paid inference. If allowed, download and SHA-256 verify official Qwen3.5-4B-Q4_K_M GGUF (historical pinned SHA-256 `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`; independently confirm precise name/revision/hash, don't blindly trust this snapshot). Run one real Qwen inference immediately and save transcript/timings privately.
2. Recover actual private 299-page text if already in the authorized workspace and check source hashes, paragraph/page coverage, index integrity, conflicts and figure limitations.
3. Compare Qwen3.5-4B against bigger models including suitable Qwen3.5-9B and optional PrismML Bonsai 2 27B ternary only if their license/runtime/memory/latency permit and fresh DEV tests support benefit. Bonsai small GGUF may require specialized ternary kernels. Avoid download tournaments that delay a working v11 baseline.
4. Use newly sealed, source-grounded medical questions (supported AND unsupported), independent grading and logged source citations; test reasoning accuracy as distinct from retrieval recall. Keep exam keys sealed and never tune on the final key. Aim high; document confidence errors and latency.
5. Reconcile source branch and v11 signed APK; verify manifest, signer, repeat-build and offline Android 17 lifecycle. Preserve installed historic v6/v8 and Termux. Never silently install/grant permissions or replace the user's phone app.
6. Build a practical one-screen phone handoff; verify offline device mic, whisper ASR, model residency/speed, TTS audibility and stop/follow-up correctness when an actually authorized connection is available.
7. Commit **code only** in isolated PR/review branch, preserve rollback and source history, and checkpoint exact SHA, tests, artifacts, failures and next blockers. Avoid more than 3 specific owner-only tasks, with $0 additional spend.

## Claude Code next instruction, copy into the cloud session

> Resume NEU205 ONE directly from the PUBLIC zero-context guide at `docs/neu205/CLAUDE_CODE_PUBLIC_RESUME.md` and current draft PR #1605. Recover and preserve the current source branch, test actual Hugging Face model access inside YOUR environment, run verified Qwen inference first, then finish honest full-book accuracy+Android execution. Use existing private assets if actually present; never claim to have the private ZIP from this public guide. Do not upload private textbook/exam/keys anywhere public, spend money, or affect the phone without authorized access. Execute code/tests now, not just another plan. Record exact receipts and block only on true missing inputs.

**Truthful scope:** Publishing this handoff to `main` is NOT uploading the 109 MB private ZIP and does NOT constitute release readiness. It is a practical public entry point so Claude can work from the code already in PR #1605.
