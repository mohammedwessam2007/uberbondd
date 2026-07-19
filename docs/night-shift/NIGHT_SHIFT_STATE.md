# UberBond Night Shift State

- Repository: `mohammedwessam2007/uberbondd`
- Branch: `main`
- Starting commit: `ba2b100ac57b7cf0fd84532f6ea6770c6ebeed8a`
- Current loop: 15
- Completed milestones: Loop 1 — CTA evidence detection repaired and committed locally as `a19bfbacde89bd91bc160fc7e870533aeefcb3d8`; Loop 2 — strict campaign configuration, dual live-send approval gates, and a disabled demonstration campaign committed locally as `5509b837d1fec2db8830d6d11fe6077dccc0a4af`; Loop 3 — campaign-driven, resumable, evidence-provenance-preserving discovery factory committed locally as `98c4163d2f7daa044ece25f0fb010d6a8998da69`; Loop 4 — controlled crawling, evidence validation, quality-gated qualification, and bounded retries committed locally as `2ed82bfd2901d33cf80fae1a7ed6d65c612ad43c`; Loop 5 — evidence-preserving public contact intelligence and strict contact readiness committed locally as `e9a61c41b5082e754a3147e67ea65c605b9e795e`; Loop 6 — sentence-bound outreach variants, strict quality gates, safe owner editing, and draft capacity committed locally as `3e6b99b60fbb088b77cffbcf5e2fc154021cadf8`; Loop 7 — privacy-safe iPad attention cockpit, lifecycle projection, approval controls, and pause controls committed locally as `3e557316c8931c54e08208409096cef4b18cf240`; Loop 8 — test-isolated Gmail provider, signed OAuth, explicit scheduling, threading, suppression, and sender health committed locally as `c1bed6296e9a936715bc86755e49bc1ba489b5f6`; Loop 9 — deterministic reply intelligence, resumable follow-up stopping, suppression, and owner-only response approval committed locally as `aa0b91007d4f402e6ce583cae5de07e9c1e27496`; Loop 10 — provider-independent evidence-linked offers, explicit owner approval, and verified idempotent payment state committed locally as `dbdeec975213775bb5703fb5652869133d24297f`; Loop 11 — verified-payment delivery records, implementation briefs, owner tasks, proof gates, and revision handling committed locally as `61b9c30b26d894104ef5881ae39f6e18a4dce529`; Loop 12 — bounded PostgreSQL acquisition workers, safe Actions schedules, isolated queue claims, and resumable recovery committed locally as `bc5b7f8628dc48f836824fbad93550fc4332ce3e`; Loop 13 — outcome-only funnel measurement, stable variant assignments, durable experiments, and owner-gated recommendations committed locally as `88344e4efbfa28604ea25a01b34dde6446b03583`; Loop 14 — SSRF/DNS-rebinding defenses, capability and log-leak prevention, stale-lease fencing, atomic final-send checks, and suppression-race protection committed locally as `10b4a1a748bf347ebb9e71091681a593d7c7eeb7`
- Active task: Checkpoint the completed P1O acceptance milestone and export its recovery artifacts
- Test results: `npm run acceptance` passed all 19 printed transitions from fixture discovery through a verified paid test order and delivery task, asserting one simulated Gmail call, zero real emails, zero real payments, zero external network calls, and zero customer-site changes; 22/22 focused acceptance/campaign/reply/payment tests passed; `npm run check` passed on the final diff (syntax checks plus 195/195 deterministic tests); `CHROMIUM_PATH=/tmp/chromium npm run test:browser` passed (8/8); `npm audit --audit-level=low` reported 0 vulnerabilities; explicit changed-module syntax checks and `git diff --check` passed. No real email, payment, customer, customer-site modification, provider call, production deployment, or Lite change occurred.
- Files changed in Loop 15: `config/campaigns/e2e-acceptance-dry-run.json`, `docs/ACQUISITION_ARCHITECTURE.md`, `docs/CAMPAIGN_CONFIGURATION.md`, `docs/DEPLOYMENT_MATRIX.md`, `docs/IPAD_OPERATOR_GUIDE.md`, `docs/OUTREACH_SAFETY.md`, `docs/OWNER_AUTHENTICATION_CHECKLIST.md`, `docs/REVENUE_EXPERIMENT.md`, `docs/night-shift/NIGHT_SHIFT_STATE.md`, `package.json`, `scripts/acquisition-acceptance.mjs`, and `tests/acquisition-acceptance.test.mjs`
- Latest local commit SHA: `10b4a1a748bf347ebb9e71091681a593d7c7eeb7`
- Latest remote commit SHA: `ba2b100ac57b7cf0fd84532f6ea6770c6ebeed8a`
- Blockers requiring owner action: GitHub publication — direct HTTPS push has no credential helper, `gh` is not installed, and the connected GitHub integration returned `403 Resource not accessible by integration`; authenticate GitHub CLI with repository write access or grant the GitHub app Contents write permission. Remote acquisition workers additionally require `ACQUISITION_DATABASE_URL`; draft runs require the HTTPS app-base variable and `ACQUISITION_UNSUBSCRIBE_SECRET`; real reply synchronization remains blocked pending Gmail OAuth and a non-CI authorized runtime because real Gmail access is intentionally prohibited in CI. None of these block provider-independent local work.
- Next highest-priority unblocked task: None within the requested 15-loop mission; publication and live-provider validation require the owner-authentication steps recorded below and must not be inferred from local tests
- Recovery instructions: Reset a fresh checkout to `ba2b100ac57b7cf0fd84532f6ea6770c6ebeed8a`, then apply the P1A through P1N format patches in milestone order with `git am`; the companion ZIP files contain complete changed files with repository paths if patch application is unavailable
- Exported patch filenames: `docs/night-shift/patches/0001-P1A-repair-CTA-evidence-detection.patch`; `docs/night-shift/patches/P1A-repair-CTA-evidence-detection.zip`; `docs/night-shift/patches/0001-P1B-add-validated-campaign-configuration.patch`; `docs/night-shift/patches/P1B-validated-campaign-configuration.zip`; `docs/night-shift/patches/0001-P1C-build-resumable-prospect-discovery-factory.patch`; `docs/night-shift/patches/P1C-resumable-prospect-discovery-factory.zip`; `docs/night-shift/patches/0001-P1D-connect-discovery-to-evidence-backed-qualificati.patch`; `docs/night-shift/patches/P1D-evidence-backed-qualification.zip`; `docs/night-shift/patches/0001-P1E-harden-public-business-contact-intelligence.patch`; `docs/night-shift/patches/P1E-public-business-contact-intelligence.zip`; `docs/night-shift/patches/0001-P1F-add-evidence-locked-outreach-generation.patch`; `docs/night-shift/patches/P1F-evidence-locked-outreach-generation.zip`; `docs/night-shift/patches/0001-P1G-build-iPad-prospect-and-revenue-cockpit.patch`; `docs/night-shift/patches/P1G-iPad-prospect-revenue-cockpit.zip`; `docs/night-shift/patches/0001-P1H-complete-controlled-Gmail-outreach-engine.patch`; `docs/night-shift/patches/P1H-controlled-Gmail-outreach-engine.zip`; `docs/night-shift/patches/0001-P1I-add-reply-intelligence-and-follow-up-stopping.patch`; `docs/night-shift/patches/P1I-reply-intelligence-followup-stopping.zip`; `docs/night-shift/patches/0001-P1J-add-verified-offer-and-payment-state-machine.patch`; `docs/night-shift/patches/P1J-verified-offer-payment-state-machine.zip`; `docs/night-shift/patches/0001-P1K-create-paid-delivery-workflow.patch`; `docs/night-shift/patches/P1K-paid-delivery-workflow.zip`; `docs/night-shift/patches/0001-P1L-add-scheduled-acquisition-workers.patch`; `docs/night-shift/patches/P1L-scheduled-acquisition-workers.zip`; `docs/night-shift/patches/0001-P1M-add-acquisition-learning-engine.patch`; `docs/night-shift/patches/P1M-acquisition-learning-engine.zip`; `docs/night-shift/patches/0001-P1N-harden-acquisition-system-security.patch`; `docs/night-shift/patches/P1N-acquisition-security-hardening.zip`

## Loop 1 implementation record

1. Expanded visible-action extraction across action-language buttons, accessible action links, submit inputs, and functional form submits.
2. Ignored hidden, disabled, aria-hidden, inert, zero-size, template-only, and ancestor-hidden controls.
3. Added explicit render/crawl quality signals and suppressed unsupported absence findings when quality is degraded.
4. Stored sanitized visible CTA evidence in durable Lite report summaries.
5. Added positive, negative, ambiguous, hidden-control, degraded-render, and current Lite homepage regressions.
6. Verified the complete deterministic and browser suites without touching Vercel, Neon, GitHub Actions configuration, or the working Lite deployment.

## Loop 2 implementation plan

1. Inspect existing configuration, input validation, safety gates, scheduler, and campaign storage before adding schema code.
2. Define a deterministic campaign schema with strict unknown-field rejection, normalized countries and time windows, bounded capacities, and credential-field rejection.
3. Enforce system-plus-campaign live-send approvals and reject unsafe `autoSend`/`dryRun` combinations.
4. Add one disabled demonstration campaign and tests for all required validation invariants.
5. Run targeted tests and syntax checks, then commit and export P1B without attempting live sending.

## Loop 2 implementation record

1. Added a strict, machine-readable campaign schema with unknown-field, credential-field, country, bounding-box, capacity, time-window, and variant validation.
2. Required independent system and campaign approvals for live configuration; campaigns cannot self-arm through the public admin endpoint, and the disabled demo has zero live-send capacity.
3. Preserved runtime compatibility through normalized aliases while making canonical campaign fields authoritative in safety and pipeline code.
4. Added a disabled healthcare demo covering UAE, Saudi Arabia, Qatar, Kuwait, the UK, and Australia, plus owner-facing configuration documentation.
5. Verified 20 focused tests, 99 deterministic tests, 7 browser tests, every changed JavaScript module, and whitespace integrity without sending email or changing the working Lite deployment.

## Loop 3 implementation plan

1. Reuse the existing Overpass client, prospect importer, repository constraints, and capacity reservations instead of creating parallel discovery paths.
2. Drive discovery from validated campaign countries, city-sized bounding boxes, and category selectors with resumable bounded batches.
3. Harden public-website qualification, own-domain and directory/parked-page rejection, normalized-domain and campaign-level deduplication, and source provenance.
4. Add retry-safe queue imports, dry-run previews, and privacy-safe CSV/JSON exports capped at 100 prospects per day for discovery, audit, and drafting—not live sends.
5. Run targeted tests, all changed-module syntax checks, the required third-loop `npm run check` and `npm audit`, then checkpoint and export P1C.

## Loop 3 implementation record

1. Expanded whitelisted OpenStreetMap selectors for medical, dermatology, cosmetic, fertility, healthcare-agency, professional-services, and selected B2B records without adding a paid provider.
2. Added strict public-business website normalization that rejects private and metadata targets, UberBond-owned domains, reserved or malformed names, social/directories, known parking infrastructure, and duplicate normalized domains.
3. Added campaign-aligned geographic batches for UAE, Saudi Arabia, Qatar, Kuwait, the UK, and Australia with durable per-campaign cursors and bounded scheduled processing.
4. Made imports retry-safe by campaign-domain and provider-record identity, stored discovery time, source URL/provider/licence/attribution and finite location evidence, and queued explicit stored prospect IDs through the existing research queue.
5. Added atomic global and campaign daily reservations capped at 100, dry-run previews, safe rejection summaries, and source-complete CSV/JSON export coverage without changing live-send configuration.
6. Verified 31 focused tests, the discovery smoke flow, 104 deterministic tests, 7 browser tests, all changed JavaScript syntax, whitespace integrity, and an npm audit with zero reported vulnerabilities.

## Loop 4 implementation plan

1. Inspect and extend the existing browser crawler, robots handling, deterministic audit, artifact persistence, scoring, issue selection, dossier, pipeline, and durable queue paths.
2. Add campaign page limits, per-domain pacing, bounded browser concurrency, explicit attempt/failure categories, and stale prospect recovery without weakening SSRF controls.
3. Validate every finding against stored page evidence and retain evidence URL, excerpt, screenshot reference, confidence, severity, estimated commercial impact, and estimated effort.
4. Reject parked, inaccessible, incomplete, or low-quality crawls and prospects with no credible issue; optional AI may only enhance already supported evidence.
5. Generate a concise deterministic dossier for qualified prospects, add resumable integration fixtures, run targeted and full regression checks, then checkpoint and export P1D.

## Loop 4 implementation record

1. Added campaign-level page ceilings, in-process browser semaphores, durable hashed per-domain start reservations, robots-aware pacing, SSRF-safe robots retrieval, and public-access metadata.
2. Added atomic campaign daily-audit capacity with idempotent prospect reservations and next-day deferral, while keeping the system ceiling at 100 and live sending unrelated and disabled.
3. Added categorized crawl failures, exponential retry scheduling, per-prospect attempt ceilings, stale prospect recovery, and terminal `audit-failed` state after retry exhaustion.
4. Added deterministic crawl-quality scoring that rejects parked pages, access challenges, insufficient rendering, mostly failed crawls, and sites with no usable public page before contact or outreach work.
5. Bound every accepted finding to a crawled evidence URL, typed evidence, excerpt, screenshot reference, confidence, severity, qualitative estimated impact, and qualitative estimated effort.
6. Required exact on-page excerpts for optional AI findings and marked all AI-enhanced observations human-review-only and ineligible for outreach; deterministic evidence remains authoritative.
7. Added concise quality-aware dossiers and rejected prospects with no credible campaign-threshold evidence or score, then verified 32 focused tests, 116 deterministic tests, 7 browser tests, and the discovery smoke flow.

## Loop 5 implementation plan

1. Inspect the existing public-page contact extractor, crawler page evidence, Hunter adapter, send-safety rules, and contact use in the pipeline.
2. Extract only explicitly published emails from same-domain website pages, mailto links, structured data, headers, footers, contact pages, and team pages while preserving source URL and excerpt.
3. Classify named versus role mailboxes, rank owner/founder/director/partner/doctor/practice-manager/marketing leadership, and reject legal, privacy, security, abuse, webmaster, postmaster, no-reply, unrelated-domain, and free personal addresses.
4. Keep Hunter optional, label publication versus external verification accurately, and never construct or promote guessed email patterns.
5. Add deterministic fixtures and full regressions, then checkpoint and export P1E without sending email.

## Loop 5 implementation record

1. Replaced raw-HTML email matching with typed evidence from visible text, visible `mailto:` actions, and published structured data, preserving the exact crawled page URL, excerpt, extraction method, and page context.
2. Excluded hidden, disabled, aria-hidden, inert, zero-size, template-only, and non-rendered addresses from browser contact evidence and retained only business-domain or subdomain addresses.
3. Added deterministic named-versus-role mailbox classification and relevance ranking for owners, founders, managing directors, partners, directors, practice managers, marketing leaders, doctors/dentists, and managers.
4. Rejected free personal mail, unrelated domains, and risky legal, privacy, abuse, security, webmaster, postmaster, no-reply, mailer-daemon, unsubscribe, and spam mailboxes before selection.
5. Kept Hunter optional, header-authenticated, time-bounded, non-guessing, and PII-safe on errors; unverified enrichment remains review-only while only explicit `valid` verification can satisfy the external-verification path.
6. Unified qualification readiness with the final send gate so a contact cannot become send-ready without stored publication evidence or positive external verification; live outbound remains disabled and no email was sent.
7. Added the owner-facing outreach safety policy and verified 27 focused tests, 123 deterministic tests, 7 browser tests, every changed JavaScript module, and whitespace integrity.

## Loop 6 implementation plan

1. Inspect the existing deterministic copy builder, optional AI adapter, dossier, campaign variants, public admin review surface, and send gate before changing draft generation.
2. Define a sentence-level evidence-binding format covering business identity, selected issue, exact excerpt, affected page, relevant service, campaign offer, public recipient role, CTA, disclosure, and opt-out.
3. Generate concise deterministic subject/message variants with one supported problem, one qualitative implication, one low-friction CTA, no generic compliment opening, and no unsupported claims or fabricated urgency.
4. Validate optional AI output against the same evidence and prohibited-language gates; AI failure or rejection must fall back deterministically and can never weaken evidence requirements.
5. Score evidence fidelity, specificity, clarity, length, CTA simplicity, prohibited language, duplicate phrasing, and hallucination risk; reject drafts below threshold and expose preview/edit metadata without enabling live sending.
6. Add deterministic fixtures, run the required sixth-loop `npm run check` and `npm audit`, checkpoint P1F, export recovery artifacts, and continue to the iPad cockpit.

## Loop 6 implementation record

1. Rebuilt initial outreach generation around a versioned context that binds business identity, verified website, selected issue, exact excerpt, affected page, audited implication, relevant service, campaign offer, CTA, public recipient context, software disclosure, opt-out, and sender identity.
2. Generated multiple deterministic subject/message variants while keeping one problem, one qualitative implication, one low-friction CTA, concise length, an explicit software-assisted-review disclosure, and a respectful opt-out.
3. Stored the binding IDs used by every sentence and required exact approved sentence forms, exact evidence, same-domain page provenance, and campaign facts; invented sentences, unknown bindings, unsupported numbers, fake manual-review language, urgency, guarantees, and medical claims are rejected.
4. Added quality scoring for evidence fidelity, specificity, clarity, length, CTA simplicity, prohibited-language compliance, duplicate phrasing, and hallucination risk, with critical dimensions required at 100 and a minimum overall threshold of 82.
5. Added a privacy-minimized optional AI adapter whose output passes the identical gate; provider failure or invalid output falls back to deterministic variants, and AI context excludes recipient email, sender address, and unsubscribe tokens.
6. Added atomic, hashed, campaign-scoped daily draft reservations for JSON and PostgreSQL stores and required the final send gate to match the stored quality-approved subject/body record exactly.
7. Added authenticated owner preview and safe-edit controls; every edit is rebound, rescored, and rejected if it adds an unsupported sentence or changes a required fact.
8. Verified 41 focused tests, 132 deterministic tests, 7 browser tests, every changed JavaScript module, whitespace integrity, and an npm audit with zero reported vulnerabilities; no real email was sent and live outbound remains off.

## Loop 7 implementation plan

1. Inspect the existing command center, summary API, prospect/reply/payment/delivery records, campaign and inbox controls, authentication boundary, and responsive styles.
2. Normalize the required acquisition lifecycle states without rewriting working queue, Lite audit, or revenue paths, and derive owner attention buckets from stored facts.
3. Make the default iPad view show only urgent failures, drafts awaiting review, positive replies, payment events, and delivery work, with drill-down evidence available before any approval.
4. Add authenticated approve, reject, edit, safe-batch approve, campaign pause, inbox pause, and global kill-switch controls; approval must never override failed contact, evidence, quality, suppression, or dry-run gates.
5. Add campaign, country, niche, score, status, and date filters plus privacy-safe CSV/JSON export controls, then verify Safari-sized responsive behavior without exposing secrets or OAuth tokens.
6. Add deterministic cockpit/API tests, run targeted and full regressions, checkpoint P1G, export recovery artifacts, and continue to the Gmail engine.

## Loop 7 implementation record

1. Added a deterministic 24-state acquisition lifecycle projection and a privacy-minimized cockpit snapshot that omits contact emails, message/reply bodies, OAuth data, report tokens, provider references, and credentials.
2. Made the authenticated iPad attention view the default, limited to urgent failures, drafts awaiting review, positive replies, payment events, and queued delivery tasks; the full operations console remains available on demand.
3. Added campaign, country, niche, minimum-score, lifecycle-status, and date filters, complete lifecycle counts, and authorization-header CSV/JSON downloads using a safe field projection rather than token-bearing URLs.
4. Added single approve, reject, evidence inspection/edit, and bounded safe-batch approval controls. Every approval rechecks campaign state, public contact provenance, same-domain evidence, confidence, score, exact quality-approved draft content, suppressions, and terminal state, then records `liveSendEligible: false` without scheduling or sending.
5. Added campaign, inbox, and global outbound pause controls. The cockpit can resume only a dry-run campaign that it explicitly paused and cannot activate the disabled demonstration campaign or any live-capable campaign.
6. Added 44-pixel touch targets and responsive one/two-column layouts for Safari-sized iPad and mobile viewports, plus an operator guide explaining evidence review, exports, pause precedence, and operational meanings.
7. Changed files in this milestone: `docs/IPAD_OPERATOR_GUIDE.md`, `docs/night-shift/NIGHT_SHIFT_STATE.md`, `package.json`, `public/admin.html`, `public/admin.js`, `public/styles.css`, `server.mjs`, `src/cockpit.mjs`, `tests/cockpit-browser.test.mjs`, and `tests/cockpit.test.mjs`.
8. Verified 5 focused deterministic cockpit tests, 1 focused iPad browser test, 137 complete deterministic tests, 8 complete browser tests, changed-module syntax, and whitespace integrity; no real email was sent and outbound remains disabled/dry-run by default.

## Loop 8 implementation plan

1. Inspect the existing Gmail OAuth/token adapter, pipeline send/follow-up paths, durable reservations, sender-health store, unsubscribe module, scheduler, configuration fail-closed rules, and current fixtures before modifying them.
2. Preserve encrypted OAuth storage and real-provider isolation while adding a deterministic test provider, correct Gmail reply threading, explicit initial approval/scheduling, and ambiguous-result handling that never retries automatically.
3. Enforce system, campaign, inbox, daily/hourly, randomized-gap, recipient-local business-hour, weekday, suppression, unsubscribe, duplicate-send, and global-kill gates immediately before dispatch.
4. Keep one follow-up maximum and stop it on every reply, unsubscribe, bounce, complaint, suppression, or payment; add permanent email/domain suppression and automatic inbox pause behavior.
5. Surface privacy-safe sender health and provider state in the cockpit without exposing tokens or message bodies; do not activate any campaign or send a real email.
6. Add deterministic fixtures and test-mode integration coverage, run changed-module syntax plus full regressions, checkpoint P1H, export recovery artifacts, and continue to reply intelligence.

## Loop 8 implementation record

1. Added explicit `test` and `gmail` outbound providers. Test mode is the default, performs no network access, returns deterministic Gmail-like message/thread IDs, and is the only provider allowed for simulated dry-run dispatch; production live sending requires `OUTBOUND_PROVIDER=gmail` plus every prior live gate.
2. Replaced token-bearing OAuth-start navigation and memory-only state with an authenticated POST, signed expiring state, durable hashed one-time consumption, encrypted token persistence, sanitized provider errors, and a hard real-Gmail network block in test environments.
3. Added a distinct approve-then-schedule owner flow. Approval remains non-sending; scheduling creates an idempotent targeted queue job, and a manual campaign cannot send without stored owner approval and `scheduled` state.
4. Hardened MIME construction against header injection, encoded non-ASCII subjects, preserved Gmail `threadId`, `In-Reply-To`, and `References`, required original thread metadata for follow-ups, and emitted HTTPS one-click unsubscribe headers.
5. Kept system/campaign/inbox enablement, country allowlists, evidence, contact, quality, suppression, business hours, weekends, daily/hourly caps, and the global kill switch in the final dispatch gate; added deterministic 90–180 second default cadence jitter and retained durable duplicate/uncertain-send quarantine.
6. Limited automatic follow-up to explicitly activated auto-send campaigns, retained a maximum of one, and stopped due work on replies, suppression, or verified payment. One-click unsubscribe, opt-out, bounce, and complaint paths can permanently suppress both the email and business domain.
7. Preserved automatic sender pausing for complaint, bounce, and uncertain-send thresholds while removing raw recipient emails from outbound event logs in favor of deterministic hashes and replacing provider response details with bounded non-PII codes.
8. Added clear `test simulation` delivery labeling in the cockpit/exports and an operations control to schedule an approved draft; no live campaign was activated, no Gmail account was required for tests, and no real email was sent.
9. Changed files in this milestone: `.env.example`, `docs/night-shift/NIGHT_SHIFT_STATE.md`, `public/admin.js`, `server.mjs`, `src/cockpit.mjs`, `src/config.mjs`, `src/gmail.mjs`, `src/job-handlers.mjs`, `src/pipeline.mjs`, `src/send-safety.mjs`, `src/store.mjs`, `tests/cockpit.test.mjs`, `tests/input-config.test.mjs`, and `tests/send-safety.test.mjs`.
10. Verified 30 focused tests, 147 complete deterministic tests, 8 browser tests, every changed JavaScript module, and whitespace integrity; the live provider remains unconfigured and disabled.

## Loop 9 implementation plan

1. Inspect the existing Gmail reply poller, coarse rules/AI classifier, reply persistence, prospect stop states, suppressions, notifications, and cockpit reply surface before changing ingestion.
2. Define deterministic high-confidence rules for interested, meeting requested, asks for information, price objection, already has provider, not now, not interested, unsubscribe, automatic reply, bounce, complaint, and unknown-needs-review.
3. Match replies by exact Gmail thread and RFC reply metadata first, use exact normalized sender only as a constrained fallback, deduplicate provider messages, and persist classification provenance/confidence.
4. Cancel follow-ups immediately on every human reply; add durable email/domain suppression for unsubscribe, complaint, and hard bounce; create owner tasks for positive and low-confidence cases.
5. Generate concise deterministic response suggestions without negotiating, promising, proposing, or sending; require explicit owner approval before any later response dispatch.
6. Add fixtures for every class plus thread, dedupe, suppression, and no-send integration tests; run the required ninth-loop `npm run check` and `npm audit`, checkpoint P1I, export recovery artifacts, and continue to the offer/payment state machine.

## Loop 9 implementation record

1. Added twelve normalized reply states with deterministic high-confidence rules, quoted-history removal, `Auto-Submitted` recognition, explicit confidence/reason provenance, and a fail-closed `unknown-needs-review` result.
2. Kept deterministic rules authoritative and made optional AI classification second-stage only for unknown text; invalid or below-0.85 AI results remain in human review and cannot override an unsubscribe, bounce, complaint, or other deterministic signal.
3. Replaced permissive substring matching with exact Gmail thread matching, exact RFC `In-Reply-To` matching, and a constrained exact-mailbox fallback; ambiguous and unmatched replies are stored as private review items instead of being silently attached or discarded.
4. Made reply processing resumable and idempotent across crashes. A stored-but-incomplete reply is reprocessed until its follow-up stop, suppression, notification, and sender-health effects complete, while reply records, notifications, and bounce/complaint events remain deduplicated.
5. Cleared `nextFollowupAt` for every classified reply, added permanent email/domain suppression for unsubscribe, complaint, and hard bounce, email suppression for not-interested, and retained automatic inbox pausing through sender-health thresholds.
6. Added owner tasks for positive and low-confidence replies, safe unmatched-reply alerts, privacy-minimized cockpit projections, and authenticated reply inspection without exposing reply bodies or addresses on the default attention screen.
7. Added deterministic positive-response suggestions that cannot send, negotiate, quote prices, add links, or issue proposals; owner edits pass a bounded safety gate, and owner approval records `sendEligible: false` with no response-send endpoint.
8. Changed files in this milestone: `docs/night-shift/NIGHT_SHIFT_STATE.md`, `package.json`, `public/admin.js`, `server.mjs`, `src/ai.mjs`, `src/cockpit.mjs`, `src/gmail.mjs`, `src/pipeline.mjs`, `src/replies.mjs`, `tests/cockpit-browser.test.mjs`, `tests/cockpit.test.mjs`, and `tests/replies.test.mjs`.
9. Verified 13 focused deterministic tests, 1 focused iPad browser flow, 155 complete deterministic tests, 8 complete browser tests, all changed JavaScript syntax, whitespace integrity, and an npm audit with zero vulnerabilities; no real email was sent.
10. Recovery artifacts: format patch SHA-256 `3b8ff128d1eb71b256c8e11745e247c5070b928dbdeb5ac573cd1d5cc3f22762`; path-preserving ZIP SHA-256 `4c47c7e7d700057d50b708f913530566a621775eac167fa07ee0a8207ac2c96b`.

## Loop 10 implementation plan

1. Inspect the existing revenue engine, Lemon Squeezy adapter, checkout links, webhook verification, order persistence, campaign offers, and test-payment paths before adding new state.
2. Define a provider-independent offer object linked to campaign, prospect, and selected audit issue, with validated offer type, scope, currency, amount, and explicit owner approval.
3. Add diagnostic, implementation-sprint, and optional-monitoring offers without fake discounts or automatic payment requests; keep test and live provider modes visibly separate.
4. Implement deterministic checkout-sent, paid, refunded, disputed, and cancelled transitions with immutable payment-event history, signature verification, and provider-event idempotency.
5. Accept paid state only from a verified provider webhook or an explicit owner-confirmed manual-payment action; reject redirects, screenshots, emails, and frontend assertions as payment proof.
6. Add authenticated owner controls and deterministic fixtures, run targeted/full regressions and syntax checks, checkpoint P1J, export recovery artifacts, and continue to paid delivery records.

## Loop 10 implementation record

1. Added a strict provider-independent offer record linked to the campaign, prospect, lead, and immutable hash plus snapshot of the selected website evidence. Diagnostic, implementation-sprint, and recurring-monitoring types require bounded integer minor-unit prices, an allowlisted currency, an explicit scope, exclusions, and a test, manual, or Lemon Squeezy provider mode.
2. Added a deterministic state machine for `draft`, `approved`, `checkout-sent`, `paid`, `refunded`, `disputed`, and `cancelled`. Approval and checkout issue are separate owner actions, every transition retains a bounded history with hashed references, and repeated transitions cannot bypass source authorization.
3. Replaced computed public checkout options with stored owner-approved offers. Test offers never appear publicly, checkout is unavailable before the owner issues it, and a browser redirect, screenshot, email, or frontend assertion cannot mark an offer paid.
4. Added isolated test payments, explicit owner-confirmed manual payments, and Lemon Squeezy hosted checkout metadata. Signed Lemon events are validated against the exact offer, prospect/lead linkage, amount, currency, and test/live mode before any paid state is accepted.
5. Added raw-body HMAC verification, provider-event idempotency, cross-offer collision rejection, resumable `processing`/`completed` payment events, privacy-minimized order storage, revenue/refund events, follow-up stopping, notifications, and monitoring activation/cancellation.
6. Added PostgreSQL and JSON persistence for offers plus indexed offer-linked payment state, retry-safe JSON import, authenticated iPad controls for create/approve/issue/confirm/simulate, and safe JSON export. No credentials, raw webhook payload, customer email, or OAuth token is copied into payment-event records.
7. Preserved full-report access when one paid offer remains valid after a different offer is refunded, while refunded or disputed single-offer access closes deterministically; daily revenue progress is clamped safely after refunds.
8. Changed files in this milestone: `docs/night-shift/NIGHT_SHIFT_STATE.md`, `migrations/005_offer_payment_state.sql`, `public/admin.js`, `public/report.js`, `server.mjs`, `src/json-import.mjs`, `src/payments.mjs`, `src/revenue.mjs`, `src/store.mjs`, `tests/postgres-schema.test.mjs`, `tests/revenue.test.mjs`, and `tests/store.test.mjs`.
9. Verified 19 focused tests, 159 complete deterministic tests, 8 complete browser tests, every changed JavaScript module, whitespace integrity, and an npm audit with zero vulnerabilities; all providers stayed in simulation/unconfigured mode and no real payment or email occurred.

10. Recovery artifacts: format patch SHA-256 `ee31b01f743d3e8e09152161880e91fb5ead13129899585b742a8a3bf791e6d6`; path-preserving ZIP SHA-256 `d89c47f427ec8a382ec47720923479b70ffac785455d754064f2176542e477cb`.

## Loop 11 implementation plan

1. Inspect existing paid-state hooks, dossier evidence, subscriptions, notifications, cockpit delivery projection, and any current delivery fields before introducing a new workflow.
2. Define a strict delivery record linked to the verified paid offer and payment event, with customer/site identity, selected issue and evidence snapshot, approved scope/exclusions, amount/currency, safe provider reference, deadline, checklist, required inputs, status, proof, and revision state.
3. Create the delivery exactly once after a verified `paid` transition, remain resumable across crashes, and never accept a frontend assertion or unverified payment as a trigger.
4. Generate a deterministic implementation brief and owner task while explicitly prohibiting automatic customer-site modification without separate access and authorization.
5. Add authenticated owner review/update controls and deterministic tests for diagnostic, implementation, monitoring, duplicate payment, refund/dispute, proof, and revision transitions.
6. Run targeted tests and syntax checks, checkpoint P1K, export recovery artifacts, and continue to scheduled acquisition workers.

## Loop 11 implementation record

1. Added a strict delivery record tied to an owner-approved offer, a verified paid order, and the exact provider payment event. Customer identity, website, selected issue, evidence URL/excerpt/screenshot, approved scope, exclusions, amount/currency, provider reference, deadline, checklist, required inputs, proof, revision state, and complete history remain durable.
2. Created deliveries idempotently after verified Lemon Squeezy webhooks, explicit owner-confirmed manual payments, or isolated test simulations. Frontend assertions and unverified payment sources cannot create delivery work, and recurring monitoring payments receive separate delivery cycles.
3. Generated deterministic implementation briefs and resumable owner tasks, while keeping automatic customer-site modification permanently off. Implementation steps cannot be completed until both written authorization and access inputs are explicitly recorded as received.
4. Enforced bounded workflow transitions, complete-input and checklist gates, strong proof before delivery, terminal-state protections, and auditable revision handling. Disputes pause active delivery, refunds/cancellations stop undelivered work, and later verified resolution can resume it without losing history.
5. Added PostgreSQL and JSON persistence with one delivery per paid order, retry-safe import, payment-crash recovery, authenticated delivery inspection/update controls, privacy-safe cockpit summaries, and safe export support.
6. Changed files in this milestone: `docs/night-shift/NIGHT_SHIFT_STATE.md`, `migrations/006_paid_delivery_workflow.sql`, `package.json`, `public/admin.js`, `server.mjs`, `src/delivery.mjs`, `src/json-import.mjs`, `src/revenue.mjs`, `src/store.mjs`, `tests/postgres-schema.test.mjs`, `tests/revenue.test.mjs`, and `tests/store.test.mjs`.
7. Verified 21 focused tests, 161 complete deterministic tests, 8 complete browser tests, every changed JavaScript module, and whitespace integrity; no real email, payment, or customer-site modification occurred.
8. Recovery artifacts: format patch SHA-256 `4362914501c404ac54dbb5738b68d15a6e669b300f4b1002ce480333237b5a0f`; path-preserving ZIP SHA-256 `6660dff92e2f2a9b5eefc17c2576c07dece041ef09bbc37cfc7d277a9a1a9efb`.

## Loop 12 implementation plan

1. Inspect existing GitHub Actions workflows, worker entry points, durable queue primitives, handler registry, scheduler, database initialization, and privacy-safe logging before adding scheduled automation.
2. Define separate bounded worker modes for discovery, crawl/audit, draft generation, reply synchronization, follow-up scheduling, payment reconciliation, and stale-job recovery while reusing the existing PostgreSQL-backed queues and locks.
3. Add small configurable batch ceilings, strict process/workflow timeouts, concurrency groups, resumable idempotency, manual dispatch inputs, and provider-respecting schedules with safe summaries only.
4. Keep the real-send path absent or explicitly disabled, reference credentials only through GitHub Actions secrets, prevent PII and secret output, and leave the functioning Lite audit workflow unchanged.
5. Add deterministic worker-mode and workflow-policy tests, run the required twelfth-loop `npm run check` and `npm audit`, checkpoint P1L, export recovery artifacts, and continue to acquisition learning.

## Loop 12 implementation record

1. Added one-shot scheduled worker modes for discovery, crawl/audit, draft generation, reply synchronization readiness, follow-up processing, verified-payment reconciliation, and stale recovery. Each run enqueues an idempotent singleton job and claims only its allowlisted type from the existing durable queue.
2. Extended JSON and PostgreSQL job claims with optional type isolation while preserving `FOR UPDATE SKIP LOCKED`, stale-lock recovery, heartbeat timeouts, retry ceilings, dead letters, and older-job ordering so resumable backlog cannot be starved.
3. Extracted the existing evidence-locked composer into a reusable pipeline stage and added a bounded draft worker that composes only already-qualified stored evidence without recrawling or sending. Scheduled crawl/audit can defer drafting explicitly.
4. Bounded reply polling by accounts/messages and follow-up processing by prospects, added verified `processing` payment-event recovery, and combined stale queue, stale crawl, and expired-artifact recovery into a safe maintenance job.
5. Added a read-only GitHub Actions workflow with separate concurrency groups, strict 10–20 minute timeouts, small batches, schedules, manual mode selection, PostgreSQL-only preflight, secret/variable references, deterministic tests, and seven-day artifacts containing only count/status summaries.
6. Kept every Actions worker on disabled/dry-run outbound and omitted any scheduled `outbound.process` job. Reply sync is manual readiness-only in Actions because the existing real-Gmail-in-CI prohibition remains authoritative; missing Gmail or database authentication yields a safe blocked summary rather than weakening controls.
7. Left `.github/workflows/lite-audits.yml`, every `lite/` file, Vercel, and the production Lite deployment untouched. No real email, payment, or customer-site change occurred.
8. Changed files in this milestone: `.github/workflows/acquisition-workers.yml`, `docs/night-shift/NIGHT_SHIFT_STATE.md`, `package.json`, `scripts/run-acquisition-worker.mjs`, `src/job-handlers.mjs`, `src/pipeline.mjs`, `src/queue.mjs`, `src/revenue.mjs`, `src/scheduled-workers.mjs`, `src/store.mjs`, `tests/queue.test.mjs`, and `tests/scheduled-workers.test.mjs`.
9. Verified 15 focused worker/queue tests, 48 adjacent pipeline/reply/revenue/store/PostgreSQL tests, 170 complete deterministic tests, 8 complete browser tests, workflow YAML parsing, every changed JavaScript module, whitespace integrity, and an npm audit with zero vulnerabilities.
10. Recovery artifacts: format patch SHA-256 `9a4021a9b3dab110f570b5cdf5976fa0181fbca76358aea21c9aab17db4d91ce`; path-preserving ZIP SHA-256 `6482b33c0c27de062af28ab5a92098cd44afa5b776245b696ec5959889c77563`.

## Loop 13 implementation plan

1. Inspect stored prospects, campaigns, messages, replies, offers, orders, deliveries, variants, inboxes, timestamps, cockpit aggregation, and existing revenue events before defining learning records.
2. Build a deterministic event projection and funnel grouped by campaign, country, niche, evidence type, subject variant, message variant, CTA, recipient role, send time, and inbox without pixels or deceptive open tracking.
3. Preserve historical experiment assignments and outcomes, require meaningful minimum sample sizes, and generate owner-review recommendations rather than declaring premature winners or changing caps automatically.
4. Add a privacy-safe dashboard funnel and experiment view based on replies and commercial outcomes, with no contact addresses, message bodies, OAuth data, or tracking identifiers exposed.
5. Add deterministic fixtures, run targeted/full regressions and syntax checks, checkpoint P1M, export recovery artifacts, and continue to the hostile security review.

## Loop 13 implementation record

1. Added stable prospect-keyed selection across quality-approved outreach variants and stored only the assignment strategy, index, and configured variant values; the prospect key itself is never retained in assignment metadata.
2. Built a deterministic acquisition projection across campaign, country, niche, evidence type, subject variant, message variant, CTA, recipient role, UTC send-time bucket, and inbox, with discovery-date cohort filters and per-dimension sample denominators.
3. Counted delivery only from explicit stored provider signals, never from send success; excluded test sends, replies, payments, revenue, and delivery records from commercial results while exposing separate clearly labeled simulation counts.
4. Tracked discovered, qualified, draft-approved, sent, known-delivered, bounced, unsubscribed, replied, positive reply, meeting requested, proposal sent, checkout sent, verified paid, net revenue by currency, and completed delivery without message bodies, addresses, customer names, OAuth data, or tracking identifiers in the learning response.
5. Added strict PostgreSQL and JSON experiment storage, JSON recovery import, two-to-four safe variants, a minimum of 20 observations per variant, absolute and relative lift gates, retained aggregate evaluation history, and terminal owner decisions that cannot mutate campaigns or sending caps.
6. Added authenticated learning and experiment endpoints plus an operations-only iPad funnel and experiment lab; the default attention screen remains limited to urgent items, approvals, positive replies, payments, and delivery tasks.
7. Kept open tracking and invisible pixels absent, declared the outcome-only policy in code and UI, and left every live-send control unchanged and off by default.
8. Changed files in this milestone: `docs/night-shift/NIGHT_SHIFT_STATE.md`, `migrations/007_acquisition_learning.sql`, `package.json`, `public/admin.html`, `public/admin.js`, `server.mjs`, `src/copy.mjs`, `src/json-import.mjs`, `src/learning.mjs`, `src/pipeline.mjs`, `src/store.mjs`, and `tests/learning.test.mjs`.
9. Verified 10 focused learning tests, 180 complete deterministic tests, 8 complete browser tests, PostgreSQL migration/index behavior, JSON recovery, every changed JavaScript module, whitespace integrity, no open-tracking implementation, and an npm audit with zero vulnerabilities.
10. Recovery artifacts: format patch SHA-256 `c7b1710d6ca4ad134549b5a2249442af55384c2eaf85c3fdbec3379ef2c029de`; path-preserving ZIP SHA-256 `87f02f7838df0cb5ce337ea5c905252ba3a3fc356ec777158313aa62299cc7c1`.

## Loop 14 implementation plan

1. Inspect the existing network guards, SQL construction, HTML rendering, logging, OAuth and report-token handling, webhook verification, queue locking, send reservations, suppression flow, dashboard authentication, and retry semantics before changing code.
2. Build a concrete threat matrix and deterministic adversarial tests for SSRF, injection, credential leakage, forged payment events, duplicate sends, stale locks, accidental live sending, suppression races, cross-campaign access, and destructive replay.
3. Fix every confirmed critical or high-severity finding in bounded modules without weakening dry-run, approval, evidence, unsubscribe, or global-kill-switch invariants.
4. Run focused security regressions, syntax checks for every changed JavaScript module, full deterministic/browser checks as appropriate, and `npm audit`, then checkpoint and export P1N.

## Loop 14 implementation record

1. Replaced query-string admin credentials with timing-safe Bearer-only authentication and set a global `no-referrer` policy so owner capabilities cannot leak through URLs or navigation.
2. Removed report tokens from request paths and persistent plaintext storage. New private reports use URL fragments plus a POST body, store only a hash unless a configured encryption key is available, and production automatic report delivery now requires encrypted capability storage.
3. Hardened browser crawling against DNS rebinding and cross-origin pivoting by resolving only public addresses, pinning audited hosts to vetted IPs, validating actual response addresses, blocking third-party HTTP requests, and marking blocked-resource crawls degraded so absence findings cannot be invented.
4. Fenced JSON and PostgreSQL queue completion/failure with exact worker leases so a stale worker cannot overwrite a reclaimed job, and sanitized stored/printed queue errors.
5. Added an atomic final outbound dispatch fence that rechecks the global kill switch, inbox and campaign pauses, owner/live approvals, recipient and domain suppression, replies, terminal/payment state, follow-up limits, and the exact approved draft immediately before provider dispatch.
6. Made reply stopping, suppression, and send finalization race-safe. An unsubscribe, reply, bounce, complaint, or payment received while a provider call is in flight remains authoritative and permanently prevents a follow-up.
7. Added centralized operational redaction for addresses, Bearer values, database URLs, OAuth/report tokens, JWT-like values, sensitive nested keys, and provider errors; added spreadsheet-formula neutralization to CSV exports.
8. Rejected hostile and private website schemes at public lead intake, retained verified webhook/idempotency controls, and covered cross-campaign draft reassignment and destructive replay in adversarial tests.
9. Added 14 deterministic hardening regressions, including PostgreSQL behavior through PGlite. Verified 194/194 deterministic tests, 8/8 browser tests, 33/33 review probes, 22/22 outbound probes, the integration smoke, all changed-module syntax, whitespace integrity, and an npm audit with zero vulnerabilities.
10. The native embedded-PostgreSQL smoke remains environment-blocked because this sandbox cannot create the required OS user; equivalent PostgreSQL queue and outbound-fence tests passed. The Lite workflow, `lite/` application, Neon queue, Vercel project, and production deployment were untouched.
11. Recovery artifacts: format patch SHA-256 `7e5bb696e85b23ca87b01d89c9c827d4870caee25847f96a17d7b0fba1e6b4f5`; path-preserving ZIP SHA-256 `8f0ad542f84aaa5b547e86ac015176f2f6a0989dac2ef4e2f6a1b050276b80f3`.

## Loop 15 implementation plan

1. Inspect the existing discovery/import fixtures, browser audit, scoring, contact extraction, evidence-locked copy, approval, test Gmail, reply ingestion, verified test payment, and delivery hooks before composing the harness.
2. Define one explicitly disabled deterministic test campaign and one command that uses only local fixtures and simulated providers while printing every required state transition.
3. Assert that the simulated reply cancels the follow-up, the signed test webhook alone creates paid state, and verified payment creates exactly one delivery task.
4. Add final architecture, operator, safety, authentication, campaign, revenue-experiment, and deployment-status documentation with demonstrated-versus-blocked capability labels.
5. Run the acceptance command, relevant integration suites, every changed-module syntax check, `npm run check`, `npm audit`, then checkpoint and export P1O without touching Lite or enabling live outbound.

## Loop 15 implementation record

1. Added one strictly validated acceptance campaign that is enabled only for local fixture processing, remains dry-run, cannot auto-send, permits one test inbox, and caps discovery, audit, draft, daily send, and hourly send at one.
2. Added `npm run acceptance`, which reuses the production campaign validator, discovery runner, importer, pipeline, deterministic audit and scoring, public contact intelligence, evidence-locked composer, owner approval gate, test Gmail adapter, reply classifier, offer/payment engine, signed webhook verification, and paid-delivery hooks.
3. Printed and asserted 19 state transitions: fixture discovery, normalized import, crawl, audit, score, contact, draft, approval, schedule, simulated send, follow-up marker, simulated reply, follow-up stop, offer draft, offer approval, checkout, verified webhook, paid order, and delivery task.
4. Kept the harness entirely isolated: one reserved-domain fixture, rules-only processing, no browser or provider network request, one simulated Gmail provider call, no second call after the reply, an HMAC-signed Lemon Squeezy `test_mode` event, no real payment, and no customer-site change.
5. Added a deterministic regression that verifies the complete transition sequence, outcome counts, reply classification, delivery creation, and all zero-live-side-effect assertions.
6. Added the acquisition architecture, owner-authentication checklist, revenue experiment, and deployment matrix; updated campaign, iPad operator, and outreach-safety guides with the demonstrated acceptance boundary.
7. The deployment matrix explicitly separates fully operational, dry-run operational, Gmail-auth blocked, payment-auth blocked, optional paid enhancements, and intentionally disabled capabilities. It does not label provider integrations or unpublished workers operational.
8. Verified the acceptance command, 22 focused integration tests, 195 complete deterministic tests, 8 complete browser tests, every changed JavaScript module, whitespace integrity, and an npm audit with zero vulnerabilities.
9. The working Lite application, workflow, Neon queue, Vercel project, and production deployment remained untouched. The acquisition Web/Worker services were not deployed, and live outbound remains disabled.
