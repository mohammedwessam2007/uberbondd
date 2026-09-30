# OpenRouter Recovery Pointer — 2026-09-30

Current recovery manifest: `73_OPENROUTER_RECOVERY_MANIFEST_2026-09-30.json`

Current multiplier tracker: `74_MULTIPLIER_TRACKER_2026-09-30.json`

## Current checkpoint

**8.77636782273802× modeled canonical source-heavy cold path.**

Reference workload:

```
200k source tokens
 -> 5k exact-anchored evidence capsule via MiMo
 -> 2.5k-token GPT-6.1 Sol candidate
 -> 300-token DeepSeek audit
 -> 6-token Opus 5.5 ACCEPT
```

Direct Opus 5.5 modeled cost: **$0.85**

UberMind modeled cost: **$0.096851**

Do not count uncertified JEV/E0-E4/Decision-Franchise fanout in the current number.

## Recovery law

Read existing OpenRouter canon first, then the manifest. New verified source is execution truth. Dated backups are recovery evidence and must not silently overwrite newer code.
