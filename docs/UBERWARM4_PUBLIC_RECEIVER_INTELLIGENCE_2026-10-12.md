# UBERWARM⁴: OPEN RECEIVER INTELLIGENCE, ZERO-ADDON TRUST AND ECONOMIC FITNESS
Date: 2026-10-12 | Truth: branch-only implementation, not deployed / not live-tested / not a proven inbox winner.
Program parent: UberWarm² -> UberWarm³ PR #1403 -> UberWarm⁴ recipient-network protection donor.
Founder mission: one-of-one evidence-driven **zero-paid-warming** reputation system that seeks the best *real* sender outcomes and the least founder cash/time, not a synthetic interaction network.

## Evidence hierarchy and public competitive census

Authoritative provider/industry publications (not endorsements or empirical proofs of vendor superiority):
- Gmail all-sender and bulk sender guidance: https://support.google.com/mail/answer/81126 . SPF/DKIM/DMARC alignment, TLS, PTR, complaint <0.1% operating goal, >=0.3% severe, avoid bursts, gradual increase, provider MX aggregation, response 4.7.28 -> cease at least 10 minutes; do NOT automatically resume solely because timer expires. Open rates are not verified by Google.
- Microsoft external sender guidance: https://learn.microsoft.com/en-us/defender-office-365/external-senders-policies-practices-guidelines . No replay after permanent 5xx to the same recipient, sender/IP reputation, unsub and authentic infrastructure. Authentication rejection of a *message* is not proof its recipient address is permanently invalid.
- Yahoo sender best practices: https://senders.yahooinc.com/best-practices/ and https://senders.yahooinc.com/complaint-feedback-loop/ . DKIM-signed CFL and ARF-based complaint suppression; only after verified enrollment. Yahoo Placement Feed https://senders.yahooinc.com/email-deliverability-performance-feeds/ is access-controlled, not assumed available for free.
- M3AAWG Sender Best Common Practices, Aug 27 2026: https://www.m3aawg.org/published-documents . This is a stronger, more current public policy baseline than a vendor's invented "warm score." M3AAWG's published Cold Email position cautions against deceptive unsolicited bulk messages and artificial simulated engagement: https://www.m3aawg.org/messaging .
- GlockApps https://glockapps.com/ offers public inbox placement seed testing, SPF/DKIM/DMARC and IP/domain blocklist checks, including limited free testing. These features are publicly described; do not imply an active UberBond integration or large free credit entitlement.
- Folderly https://folderly.com/solutions/email-deliverability-platform describes DNS/auth diagnostics, template analysis, seed placement, monitoring and remediation. Vendor 99% placements are marketing claims, not UberBond or independent benchmark results.
- Warmup Inbox https://www.warmupinbox.com/ advertises a large warming engagement network and placement monitoring; its advantage numbers are vendor claims. An external pool cannot be duplicated by writing an AI agent, and traffic constructed to game spam filtering conflicts with our mission.
- Winnr https://winnr.app/help/warming/how-warming-works.html advertises optional paid automatic warm-up. Existing $9 pilot of 3 prewarmed accounts is a different purchase from $69 Startup 50 account provision and optional $30 warming. Historical third sender quarantined. Source account status must be rechecked.

## Donor capability synthesis (no vendor source copying)

| Capability | UberBond before this PR | This PR implementation | Unverified external substrate |
|---|---|---|---|
| SPF/DKIM/DMARC and sender identity | UberDNS + provider adapters | Existing, no replacement | Public DNS/actual provider messages |
| Reputation cap and quarantine | UberWarm²/Quality | UberWarm³ source risk oracle, 0.1% warning hold | Authentic Postmaster/feedback |
| Consented independent placement | UberPlacement plan | UberWarm² actual seed executor and receiving proof callback | Independent willing accounts and receiving provider OAuth |
| No synthetic positive replies | Existing donor doctrine | Strict content and evidence boundaries | No network-equivalence claim |
| $0 incremental provider warming | Optional policy | Zero-cost effect firewall, before provider call | Exact provider entitlement remains unverified |
| Per MX/protection feedback | No known provider-wide 4.7.28 controller | **NEW UberWarm⁴ receiver protection** | Real SMTP delivery/DSN evidence and complete durable incident ledger |
| Permanent 5xx handling | Provider bounce signals | **NEW message no-retry vs actual address invalid** | Transactional suppression/no-retry storage |
| Per-recipient send guard | Existing G-SPOT/outreach authorization | **NEW UberWarm⁴ dispatch guard** subordinate to existing legal/owner/verified-cap/suppression gates | Protected server callbacks and live dispatcher wiring |
| Causal vendor superiority | No real experiment | UberWarm³ two-provider conservative holdout comparator | Real lawful randomized recipient cohorts |

### NEW source artifacts

- `src/uberwarm4-receiver-protection.mjs`: receives *only trusted* SMTP/complaint/opt-out and recovery evidence, requiring complete historical incident ledger proof and verified MX group binding. Correlated 4.7.28 holds sender-domain+recipient-provider cohort; not all destinations, not one arbitrary provider label. No auto-resume. Verified 5xx prohibits replaying **that message**, but only 5.1.1/5.1.10/5.2.1 produces permanent invalid-address suppression; auth rejection quarantines sending infrastructure, not the recipient. Complaint quarantines and durable suppressions. No external effects.
- `src/uberwarm4-dispatch-guard.mjs`: deny prospective per-recipient touch whenever observed sender/provider hold, pending durable suppression/no-retry action, recipient suppression, unidentified MX, stale/incomplete receiver evidence, legal uncertainty, missing owner authority or sender cap verifier. Returns advisory only, `dispatchAuthority:NONE`; live dispatch must independently enforce.
- `tests/uberwarm4-receiver-protection.test.mjs`, `tests/uberwarm4-dispatch-guard.test.mjs`: hostile provider spoof/replay/unknown MX, absent incident ledger, no auto-release, suppression, complaint, 5xx nuance, consent/authority/ledger missing and no paid effects.
- `src/uberwarm3-reputation-oracle.mjs` amended: authenticated >=0.1% provider spam-complaint rate yields HOLD/zero cap, not green ramp, while >=0.3% remains severe QUARANTINE.
- Prior PR #1403 source preserves approved seed/SMTP, Postgres one-shot, independent observation, consent panel, read-only Google Postmaster, cash-first governor and $0 billable add-on firewall.

## Next promotion gates

1. Exact PR-head real Node 22 ESM test run, real isolated Postgres concurrency/SQL/migration tests and authenticated receipt-source hostile tests; prior source V8 transformation checks DO NOT certify Node or deployment.
2. Bind durable complete incident ledger plus trusted recipient-provider MX resolution, suppression/no-retry reconciliation and current legal/owner send approval to existing `UberReply/UberQuality/G-SPOT` BEFORE enabling any real send. Current UberWarm⁴ is a source-only advisory; do not claim dispatch enforcement while unbound.
3. Read-only actual Postmaster and Yahoo feedback access if authenticated, with low-volume / missing-metrics states preserved. No fake recipient network, no emails sent by this PR.
4. Test genuine first touches only on legitimately eligible, willing counterparties; monitor Inbox placement, complaint/bounce, authentic responses, cleared revenue and economics; compare against paid alternative only with credible matched evidence.
5. Promotion/merge/deploy only after exact tested commit proof and authorized side effects. No forced merge of draft #1403.

### Truth and spend

**Decision:** $0 optional warming spend. We prefer the controllable, observable free path for UberBond's present tight budget. **We have not proved better Inbox placement** than Winnr. We cannot replace the external receiving network with generated fake enthusiasm. Mailbox count isn't safe first-touch capacity. Startup $69 plus retained pilot $9 => $78 recurring before any warming addon; no checkout observed. No existing paid subscriptions canceled or changed.

### PHOENIX and 890 lineage

Inherits Sovereign Cognitive Continuum, Wessam Singularity / Personal Civilization Engine hierarchy and ALL founder-moonshot-0001..0890 as stable addressable pointers via `docs/FOUNDER_890_UNIVERSAL_CROSS_CHAT_INTEGRATION.md`, original manifest and total memory; also GENESIS >890. This bounded email reputation subsystem does not delete, narrow or prove those missions.

## Final 2026-10-12 adversarial hardening checkpoint

1. A Gmail `4.7.28` may apply to SPF/DKIM domain or shared sending IP. Until independently verified IP routing is known, UberWarm⁴ now conservatively holds all known sending domains targeting the same receiving-provider group, preventing identity rotation as a hidden rate-limit bypass. This could reduce capacity; it is deliberately not sold as a performance boost. No other receiving-provider group is automatically held.
2. Receiver event evaluation refuses a clean slate unless an independently authenticated COMPLETE DURABLE INCIDENT LEDGER callback proves old unresolved incidents and recipient suppressions have not been discarded. A short data window alone cannot clear a quarantine.
3. Each accepted SMTP 5xx produces message-level no-retry, but only specific verified invalid/disabled-address statuses produce long-term recipient suppression. Authentication failure quarantines the infrastructure, not an innocent recipient. The dispatch guard requires durable reconciliation of both effects.
4. The guard never returns send authority. It needs trusted current recipient-provider identity, complete fresh receiver report, durable suppression/no-retry proof, legal route, owner approval and fresh source cap. A "clean" source-only snapshot does not start or authorize a campaign.
5. Prior UberWarm³ oracle now stops expansion at verified >=0.1% user-reported complaints and quarantines severe >=0.3%, reflecting Google published guidance.

**Latest run:** 29/29 UberWarm⁴ receiver+dispatch tests and 17/17 UberWarm³ oracle tests, or **46/46 fetched-source JavaScript V8 behavioral assertions**, with authenticated-event, SMTP/DB and receiving-provider interactions represented by test fixtures. This is not independent Node 22, real Postgres, actual SMTP, sender reputation proof or an exact source CI pass. PR #1403 remains DRAFT until real exact-head CI and integrations are proven. Previously recorded 75 UberWarm²/³ behavior checks are historical earlier-head receipts, not repeated at this new head.

**Operational effects:** no real warming traffic, customer outreach, purchases, DNS edits, deployments, provider warm-up enrollment, account switching or host mutations occurred through this code change. Original paid $9 pilot and ordinal #3 quarantine untouched. $69 Startup unverified and optional paid warming remains unpurchased. Public ecosystem research does not constitute a license to copy competitors' source or their proprietary recipient networks.
