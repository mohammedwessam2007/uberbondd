# UberMind / Claude Pro Activation: exact status

Snapshot date 2026-10-10 Cairo. Classification uses three tiers: **independently verified (I)**, **reported by Claude/user (R)**, and **unknown/unexecuted (U)**.

## Account and skill

| Fact | Evidence tier | Receipt |
|---|---|---|
| Owner completed Claude Pro Project setup | R | Owner stated "Done"; later Claude Project reported 5/5 activation checks; PHOENIX #1188 checkpoint |
| Claude.ai portable skill package exists in main | I | `integrations/claude-ai/README.md`, `PROJECT_INSTRUCTIONS.md`, `ubermind-lean/SKILL.md`, `scripts/ubermind-claude-ai-skill-pack.mjs` |
| Uploaded skill loaded as `anthropic-skills:ubermind-lean` | R | Claude report, recorded in issue #1188 |
| Actual Claude Project instruction text loaded in owner's account | R | Claude Project activation 5/5 report in issue #1188; not observable through GitHub |
| Repository readability in authenticated Claude task | R | Claude report; separate direct GitHub readback verified here |
| All 890 source shards exist / manifest declares 890 | I (manifest), R (actual native checker 890/890) | `artifacts/research/founder-moonshot-literal-corpus/manifest.json`, reported native doctor and tests |
| Exact original transcript from conversation upload | I | Original upload: 189,166 bytes, 3,679 rendered lines, SHA-256 below, matches manifest |
| Source correctness test | R | Claude reported doctor exact 890/890, corpus 5/5 and 140/140; do not claim freshly rerun in this checkpoint |
| Claude Pro remaining 5-hour and weekly quota, actual optimization saved | U | No before/after account usage readings |
| True parallel Haiku/Sonnet/Opus agents *inside ordinary claude.ai chat* | U/not established | Skill instructions do not create automatic multi-model chat tooling; Claude Code supports separate agent workflows where authenticated/account-enabled |

## Original founder corpus, non-amputated

Manifest: `artifacts/research/founder-moonshot-literal-corpus/manifest.json`.

Canonical original transcript path: `artifacts/research/founder-moonshot-literal-corpus/RAW_SOURCE_Branch_Branch_New_chat.txt`.

Original *locally uploaded* file `Branch · Branch · New chat.txt`:
- SHA-256 **`8a7be38681fd0bf15ebccecec099f25c86e4ea567f3b6e0892b6c73b2a319109`**
- Bytes **189166** (UTF-8 raw bytes)
- Rendered text lines **3679** (final line need not terminate with newline)
- 890 original idea identities remain stable across ten shard records.
- Title duplicate at `#625` and `#683` is intentionally preserved as two separate ideas.
- Claude reported all 890 title/body spans match the restored full transcript without mismatch.
- Previously observed 62,611-byte/1,000-line truncated transcript was **superseded** by the 189,166-byte full source on `main`, with strict regression test in `cda13c6`. Keep the failure history/provenance; don't mistake historical truncation for current missing ideas.
- This folder intentionally **does not duplicate the transcript**, as the public GitHub repository already contains that material. No content is removed from the original authoritative sources.

## Current GitHub state read independently

- Main SHA: `cda13c65e895b679499dacba2f100bfd5812e48a`, publication timestamp 2026-10-10 00:03:03Z.
- Open draft PR `#1377`: `ubermind/lead-path-freshness-gate-20261010`, exact head `27218f3be2def9357dcc2c2134145eca805de31c`. Not merged, not deployed.
- CI on that head: **4 failed workflows with 0 executed job steps**. Source test failure **not proven** by those jobs. Claude supplied the billing-lock diagnostic, but billing control-panel state is not verified here.
- Claude's *separate native task report* on source branch: 110/110 selected tests passed; reported 58 unrelated/pre-existing full-suite failures plus one unparseable test. These are **reported** results, not a fresh run here.
- Egypt sender-side status **BLOCKED_LEGAL_AUTHORITY** remains in effect; prospect evidence expires 2026-10-11 00:38 UTC according to the Claude report and must be refreshed before any use. Never treat elapsed evidence as current.
- Repository `private: false` independently verified from GitHub API. Git history/public file handling is a sensitive owner decision, not an authorized auto-cleanup.

## State classification

**Activation status:** `OWNER_REPORTED_CLAUDE_PROJECT_READY`. **Source completeness:** `FULL_ORIGINAL_TRANSCRIPT_UPLOAD_MATCHES_MANIFEST`. **Commercial deployment status:** `NOT_MERGED_NOT_DEPLOYED`. **Quota performance:** `UNMEASURED`.

This is a historical snapshot. For every new session, compare current main, #1188 and #1377 and preserve intervening changes rather than overwriting this checkpoint.
