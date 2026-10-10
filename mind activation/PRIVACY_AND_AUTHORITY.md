# Security, privacy, legal, spend and production authority

## Public repository and transcript

Independent GitHub API metadata on 2026-10-10: `mohammedwessam2007/uberbondd` reports `private: false` (public). The raw 890-idea transcript is present on main and historical commits; Claude reported first complete publication at commit `1380ae9`. Original transcript from conversation is exactly 189,166 bytes and matches manifest SHA-256; this checkpoint does NOT republish its text or secrets.

**Risk:** The repo's publication state may expose founder ideas, private conversation history and business context to public readers. Rewriting history is destructive and cannot retract already replicated data; flipping a repository to private also cannot erase external clones, downloads or indexing.

**Safe containment policy:** keep full originals in independently protected private backups before any deliberate removal, change of visibility or history rewrite; assess dependency breakage, collaborator access, open PRs, workflows, deployed assets and reference URLs. Ask the owner for explicit approval. Do not interpret "save everything" as authorization to republish or rewrite sensitive full transcripts.

## GitHub Actions lock and PR

PR #1377 is draft, not merged, not deployed. At this checkpoint all queried CI jobs show zero started steps. Claude's user-provided report quotes GitHub's error: "The job was not started because your account is locked due to a billing issue." The GitHub jobs API establishes 0 executed steps and failures; account billing cause is user-reported from Claude's runner log, not independently read from billing settings. No automatic spend.

## Egypt sender-side authority

The legal sender-side gate remains `BLOCKED_LEGAL_AUTHORITY`. A named outside opinion around USD 1,200 was discussed but **not approved as spend**. Alternative permissioned routes require independent legal and provider-rule validation. Neither a code patch nor automation readiness can grant lawful sender authority.

## Production, communications, billing

- No automatic PR merge, Render deployment, billing charge, domain purchase, account visibility change or external message.
- Verify exact head/test receipts and user authorization before any consequential effect.
- Never treat public GitHub code as proof that production was deployed.
- Never infer cleared payment from checkout, offer or test mode.
- Never use outdated prospect evidence beyond documented expiry.
- No paid Anthropic API/JEV/Fable fallback under the strict existing Claude Pro subscription.
