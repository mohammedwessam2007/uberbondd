# UberMind W22 | Reuse Existing Protected GitHub Credential for Real Public Issue Source

Date: 2026-10-09 Africa/Cairo. Parent source W21 merged `9777888a621e3f6f1e4a3cb93753b9b81d7e0515`, existing Render W21 `dep-db42gmqj9qps73ftuh2g` LIVE, Node v26.11.1 actual native **241/241 passed**, zero live model calls and no new paid inference.

## Real material obstacle
Production W20/W21 worker log, at W21 deployment 2026-10-08T23:34:47.394Z, `UBERMIND_LIVE_WORK_INTAKE`: selectedSourceCount=12, verifiedSourceCount=0, sourceReadFailureCount=12, error class `SOURCE_HTTP_UNAVAILABLE:403`. The existing read-only public GitHub issue fetch used an anonymous GET on Render's public outbound IP; all source-grounded Jev issue processing stalled even though the 12 issues are available to the connected authenticated GitHub tool and code is passing fixtures. Exactly 0 of those 12 real issues entered the W20 precommit during that boot. Do not masquerade template fixtures as live tasks.

The same repository already has Github relay components using protected `process.env.GITHUB_TOKEN`. Chosen minimal change: `scripts/ubermind-public-issue-intake.mjs` optionally uses this existing protected credential for the **same 12 allowlisted, read-only, bounded GETs**. No token minted, fetched, stored, copied, printed, logged, transmitted to any non-GitHub host, or exposed to task model context. When no suitable credential is configured, behavior remains anonymous and a 403 stays an explicit source failure. Operator sees only `sourceAuthenticationMode=EXISTING_PROTECTED_GITHUB_TOKEN_READ_ONLY` or `ANONYMOUS_GITHUB_PUBLIC_GET` in existing sanitized worker stdout, plus bounded source failure classes.

This does NOT circumvent GitHub provider rate limits by token rotation, create unlicensed scraping, grant private issue read authorization, alter source hashes, waive prompt injection/credential pattern checks, or authorize paid JEV. Actual account token must independently exist with sufficient GitHub access. The installed GitHub connector authentication lives in ChatGPT and is not falsely assumed shared with Render. No owner work requested if Render already has it. If token absent, this remains an irreducible credential/provider source gate. Do not ask the user to paste a credential into chat.

## New W22 adversarial tests
1) Mock source reads with a provided realistic-length fixture token: only official allowlisted GitHub REST URLs/method GET, Authorization header attached and never included in receipt JSON.
2) Explicit absent token: anonymous official GET and no Authorization header.
3) Configured token but GitHub 403: complete-source outcome false, exact two 403 observations, no secret leak or inferred real tasks/quality.

Preexisting W15/W20 source and native tests unchanged; 890 original founder corpus/shard hashes untouched. No paid inference, no autonomous outreach, customer effects, new subscriptions or historical unknown Haiku retries.

## Economic boundary
This is not itself an empirical 33,333x gain. It solves a real source availability barrier required before eligible JEV work can be executed under budget. JEV class-specific quality and actual cheapest frontier invoices still require independently authorized real executions. Those external conditions cannot be replaced with a founder/private product claim.

Founder source donor links #0057, #0058, #0059, #0060, #0226, #0445, #0653, #0877; original all 890 preserved.

PHOENIX `UBERMIND-W22-20261009-GITHUB-AUTH-REAL-SOURCE-INTAKE`. Before claiming live source recovery, verify exact main Render deployment, W22 Node test outcome and real worker `UBERMIND_LIVE_WORK_INTAKE` observation. If credential absent or permission denies, say so rather than claim work.
