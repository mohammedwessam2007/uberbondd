# Infinite Opus implementation and activation

Source recovery base: `9c78a59291950fb072b2227f7e8e061197ed72d7` (main, PR #1052).
This addition preserves V5 and the founder constitution. Its scope is executable bounded machinery; live moving-Crown quality, 24/7 deployment and economic compression remain unproven.

## Executable paths

`src/semantic-closure-kernel.mjs` implements lossless typed hashing, independently supplied authority records, pinned proof programs, exhaustive finite policies, proof-carrying circuit checks, exact opcodes and a deterministic renderer. Authority and context enter through trusted host configuration, never task payloads. Default authority is empty. Required claims, numbers, caveats, source hashes, applicability scope, invalidators, expiry and Crown revision are checked. A successful proof closes only the exact typed obligations under independently admitted records. It does not prove the custodian's facts true, parse arbitrary human semantics or establish a global frontier-quality theorem.

`src/infinite-opus-native-runtime.mjs` uses existing JsonStore/PostgresStore transactions. PostgreSQL shares an advisory transaction lock across runtime instances. JsonStore supports one process; a multi-worker host must use PostgreSQL. Three event handlers are registered in `src/founder-outcome-job-handlers.mjs`: `cognition.infinite-opus.execute`, `.demand`, and `.snapshot`. Idle operation purchases no inference. Unknown tasks queue semantic debt. A task cannot inject authority, credentials, runtime context, an executor or external-effect permission. No automatic paid scheduler or customer send is enabled.

`src/cognition-ledger.mjs` tracks exact microUSD reservations, settlement and provider identity. Policy is $1/day soft, $30/UTC month hard, at least $15 protected Crown escrow. Quiet days spend zero; harder days can use accumulated monthly capacity. Retries cannot reuse a task or call ID. Reservations are durable before dispatch; uncertain charges retain capacity. An overrun is recorded in full and freezes new paid work. Budget pressure never changes quality. Paid callbacks additionally require explicit dated authorization, current route prices, bounded output and a sufficient reservation. A calendar rollover preserves old ledgers and blocks paid work pending historical reconciliation. This governor controls the new governed path; separately authorized legacy APIs and consumer-plan activity must be reconciled into a single billing scope before anyone asserts a global $30 result.

`src/infinite-opus-market.mjs` and `scripts/infinite-opus-market-refresh.mjs` compile public economics with a maximum 24-hour expiry. Cache write/read, Batch identities, context caps, revisions and long-context tiers survive normalization. Dynamic or unknown prices are refused. `src/infinite-opus-provider.mjs` demonstrates a reservation-first OpenRouter adapter using the optional SQLite substrate. Provider fallback must preserve model identity, required tools, privacy and price ceilings; model substitution grants no semantic authority.

The native exact-response cache fingerprints the complete request body, system instructions, tools, model and revision, route, nonsecret credential scope, semantic state, source dependencies and quality contract. LIVE freshness cannot hit. Every hit rechecks the proof at current time. Provider response caching is opt-in only for PUBLIC, IMMUTABLE/BOUNDED requests; HIT/MISS/age/TTL receipts are returned. Sticky Crown packets isolate an immutable prefix from the mutable delta. Actual prompt-cache savings require observed cached-token billing.

`src/crown-closure.mjs`, `src/infinite-opus-store.mjs` and `src/infinite-opus-runtime.mjs` provide a separate Node 24 SQLite laboratory with pinned output contracts, transactional escrow, immutable capital, demand/debt, event receipts and independently recomputed Jev certificates. SQLite is optional and is not imported by production handlers. Its caller must supply independently governed context and authority. No cheap-model confidence is a certificate.

`src/infinite-opus-task-compilers.mjs` executes a small pinned cognitive ISA, exact value verifiers and bounded exhaustive solver specifications. Typed compiler substrates cover source-delta research, safe integer business totals, finite reply policies, structured outreach envelopes and observed code-test obligations. Their inputs must already be admitted. They do not resolve ambiguous strategy, certify arbitrary code or authorize outreach. Unknown task classes page upward. General solver translation and open-ended language rendering remain Crown residuals.

Existing frontier VM, superoptimizer, sealed tournament, callability provenance, fresh-task custodian and longitudinal evaluator remain the promotion and experimental scaffolding. This mission repairs semantic CSE so different operations, dependencies, evidence, metadata and side effects cannot alias. The proposer still cannot promote its own model or circuit.

## New mechanism attempted and falsified

Residual proof-cut factoring groups identical unresolved leaves across different artifact programs and carries the separate dependent roots with each shared demand. It can buy one missing decision for many different outputs while each consumer retains its own proof closure. This is a new project prototype assembled from incremental computation, demand aggregation and proof interpretation; global invention priority is not claimed.

The synthetic doctor factors 4,096 distinct consumers into one exact missing leaf. Changing one consumer's dependency produces two leaves. Cycles, unknown dependencies, duplicate roots, changed contracts and changed Crown identity must not merge. The receipt records zero adjudications and null realized savings. It is algorithm evidence, not 4,096 real Crown-equivalent artifacts or an economic multiplier. Semantic overlap and low drift must be measured on real UberBond work before extrapolating toward 33,333x.

## Market and lawful donated cognition

The refreshed registry contains 464 entries. Opus 5.5, GPT-6 Astra, GPT-6.1 Sol/Pro, Sonnet 5.5 and current Qwen/Gemini/open-model contenders remain replaceable candidates. Task-class incumbents are UNKNOWN until account callability, exact revision, current tools and fresh hidden-task results are observed. Today's primary OpenAI release makes GPT-6.1 Sol an immediate challenger; its standard prices and new cache economics are recorded. Benchmark scores and vendor release claims confer no production authority.

Primary sources:

- https://openai.com/index/introducing-gpt-6-1-sol/
- https://www.anthropic.com/claude-sonnet-5-5
- https://openrouter.ai/api/v1/models
- https://openrouter.ai/api/v1/models/anthropic/claude-opus-5.5/endpoints
- https://platform.claude.com/docs/en/about-claude/pricing
- https://openrouter.ai/blog/announcements/response-caching/
- https://openrouter.ai/blog/tutorials/prompt-caching-sticky-routing/

Supported plan-included interfaces are replaceable donors: Codex's documented ChatGPT authentication and Claude Code's documented Pro/Max authentication. A plan is not an undocumented API. No consumer UI automation, credential extraction or quota workaround was implemented. Plan-included usage, API cash, credits, donated compute and algorithmic compression must have separate ledgers.

Programs investigated, with eligibility and actual grants still unknown: OpenAI Researcher Access, Codex for Open Source, Anthropic startup benefits, public provider free routes and compute sponsorship. No application, account, award, purchase or quota claim was made. Credits do not count as compression.

- https://openai.com/form/researcher-access-program/
- https://developers.openai.com/community/codex-for-oss
- https://www.anthropic.com/startup-program-official-terms
- https://claude.com/programs/startups
- https://learn.chatgpt.com/docs/auth
- https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan

## Remaining external activation

1. Account consent and explicit paid authorization. For the existing TypingMind cockpit, Settings → API Keys → OpenRouter; the owner enters the key there. For an approved hosted canary, the owner enters `OPENROUTER_API_KEY` in that host's secret manager and supplies a nonsecret authorization receipt specifying UTC month, maximum $30, $15 Crown reserve, expiry and admitted model/provider roles. OpenRouter Keys → Create Key → monthly limit `$30` is an additional provider guard. About 5 minutes; no charge merely to configure, authorized inference may consume the stated cap. Return only the key identifier/limit confirmation and receipt reference; never the key, authorization header, cookie or password. The next action is a bounded callability/billing probe through the governed adapter, followed by the preregistered fresh-task tournament. A key alone does not authorize spend.
2. Production deployment/host consent and independent observation. Select the existing approved durable worker host, durable PostgreSQL connection and monitoring path; authorize its actual infrastructure cost separately. No new host or deployment was purchased. After authorization, deploy the tested commit and observe idle, queue, restart, provider and billing consequences. A merge is not a deployment.

The original 189,166-byte historical founder transcript is also absent: current raw file is truncated at entry 248. The 890 pinned shards remain preserved. Its validator and atomization refuse authority. Recovery needs the original bytes matching the declared hash, not a rewritten hash or reconstructed prose. This is historical evidence debt, not permission to weaken the Infinite Opus gate.

## Claim boundaries

No million-dollar value, 33,333x ratio, raw GPU equivalence, current task-class winner, global paid budget result or live 24/7 deployment is claimed. Synthetic fixtures are excluded from economic metrics. Conservative matched reference must use the cheapest capable legitimate direct frontier route, including cache, Batch, retries and material overhead. Unknown costs remain unknown. The checkpoint lists every required field and uses UNKNOWN until real producer evidence exists.

The disposable real PostgreSQL proof is reproducible with `node scripts/with-real-postgres.mjs node scripts/infinite-opus-postgres-proof.mjs --disposable`. It admitted 15 of 20 simultaneous worker reservations across two connections, preserved the $15 Crown reserve, blocked month rollover with unresolved charges and unblocked after exact historical reconciliation. It made zero provider calls. The optional wrapper includes a configurable conservative platform fee allowance (default 5.5%); supplier usage, fee assumptions and verified all-in bills must remain distinct.

Final deterministic source gate: 8,395 passed, zero failed, 55 skipped out of 8,450 tests. Existing real PostgreSQL gate: 24 suites passed. The separate native two-connection governor proof passed. A synthetic 100,000-consumer demand coalescing check completed in about 971 ms with one exact cut and dependency-drift separation; it grants no semantic authority, finished-work quality result or economic claim. See the durable execution and scale receipts.

Final source verification after release-boundary repairs: 8,402 pass, zero failures, 55 skips; 98 canonical binding checks and 107 final source/canon checks pass. The unchanged terminal tribunal now passes its declared finite source scope. No runtime, frontier equivalence, economic outcome or ASI claim follows. Postal canaries now require the canonical durable dispatcher and current final admission; standalone credentials/reservations are refused. Hosted GitHub jobs did not start because of the account billing lock. Owner may inspect GitHub Settings → Billing and licensing to resolve that lock; no payment or plan change was made here.
