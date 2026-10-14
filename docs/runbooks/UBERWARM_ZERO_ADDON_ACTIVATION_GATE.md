# UberWarm zero-add-on activation gate

Status: **INSTRUCTIONS ONLY.** Nothing in this runbook has been executed. No UberWarm layer is live. No provider is called, no mailbox is created, no SMTP message is sent, no DNS record is written, no database migration is applied, and no paid warm-up add-on is enabled. This document grants no approval.

Gate: `NO_UBERWARM_ZERO_ADDON_LIVE_AUTHORIZATION` in `config/reachability-classification.json`.

## 1. What is not live

Ten modules are classified `AWAITING_ACTIVATION` under this gate. Each is unreachable from every production and unattended entry point. None of them is production-reachable.

| Layer | Module | Live effect it could produce |
|---|---|---|
| UberWarm2 | `src/uberwarm2-pg-ledger.mjs` | Writes one-shot and daily quota claims to the authoritative PostgreSQL primary |
| UberWarm2 | `src/uberwarm2-seed-executor.mjs` | Sends real SMTP test messages to owned seed addresses |
| UberWarm2 | `src/uberwarm2-smtp-seed-bridge.mjs` | Opens a live SMTP submission transport from an encrypted sending identity |
| UberWarm3 | `src/uberwarm3-cash-first-governor.mjs` | None by itself. Decision support only, but it would govern rollout inputs |
| UberWarm3 | `src/uberwarm3-consent-panel.mjs` | Would recruit real opt-in volunteers and receive their mailbox observations |
| UberWarm3 | `src/uberwarm3-google-postmaster-v2.mjs` | Would read Google Postmaster compliance status with a separately granted OAuth grant |
| UberWarm3 | `src/uberwarm3-reputation-oracle.mjs` | Would decide what to measure and when to stop an experiment |
| UberWarm4 | `src/uberwarm4-dispatch-guard.mjs` | Would gate a dispatch decision for one intended recipient |
| UberWarm4 | `src/uberwarm4-receiver-protection.mjs` | Would place sender state into HOLD or QUARANTINE from receiver incidents |
| UberWarm6 | `src/uberwarm6-economic-dominance.mjs` | Would issue a dominance certificate for zero-add-on warming |

The ratchet enforces this. Test "no classification describes an unattended reachable module" fails if any of these modules becomes reachable from production, from an unattended script, or from the founder-interactive entry point. Do not reclassify a module to make that test pass.

## 2. Owner approvals required for each layer

Each approval is an explicit, recorded owner decision. It is not implied by a code change, a passing test, a scheduled job or a report.

### UberWarm2 seed probes (the only layer with an outbound send path)

1. **Migration.** The owner applies `docs/migrations-pending/20261012_uberwarm2_seed_one_shot.sql` first to an authorized isolated test database, then separately to the authoritative primary through an owner-authorized runner. The boot migrator never applies it. The migration is additive, sends no mail and authorizes no campaign.
2. **Approval signing key.** The owner provisions a server-held verification key of at least 32 characters in the platform secret store. It is never committed, pasted into chat or written to logs. The seed executor refuses to run without it.
3. **Seed recipients.** Each seed is an owner-controlled, receive-ready address with recorded consent evidence. Two aliases on one provider are not independent recipient networks.
4. **Sending identity.** The owner binds an already-authorized, encrypted SMTP identity through the existing protected adapter. The bridge does not provision accounts.
5. **Per-batch approval.** The owner grants a signed, unexpired approval bound to the exact batch digest and the scope `uberwarm2:owner-controlled-seed-test`. Each batch needs its own approval.
6. **Trusted observation.** A trusted receiving-side observation adapter is bound to the exact provider message ID. Self-attested text is not evidence.

A passing seed probe tests owner-controlled seeds only. It cannot prove reputation with real cold recipients, and TCP or SMTP acceptance is not inbox delivery.

### UberWarm3 governor and oracle

The owner approves feeding each independent ledger the governor and oracle read: budget, sender health, qualified contacts and receiving-side observations. Neither module authorizes sending, purchasing, cancelling or artificial warm-up traffic.

### UberWarm3 consent panel

The owner approves any recruitment. Every participant gives explicit opt-in, verified by an authenticated application, and supplies an independent receiving mailbox. No unsolicited invitations, no UberBond-created seed accounts and no warm-up replies are permitted.

### UberWarm3 Postmaster adapter

The owner authorizes the read-only `postmaster.traffic.readonly` OAuth grant for each domain it will read. The adapter performs no domain-verification mutation, no send and no DNS write.

### UberWarm4 dispatch guard and receiver protection

The owner approves each source of receiver incidents as trusted, authenticated ingestion before any HOLD or QUARANTINE decision is acted on. The owner also decides whether a guard's output may gate a live send. The modules never resume a held sender automatically.

### UberWarm6 economic dominance certificate

The owner approves each bound the certificate consumes: eligible first touches, cleared value per Inbox delivery, the placement advantage, attributable option value, UberBond's running cost, the paid fee, the horizon and the assumptions. A certificate is never created from missing, manipulated, forward-looking or unauthenticated evidence.

## 3. Paid warm-up add-on

No layer in this runbook enables, purchases, renews or cancels a paid warm-up add-on.

- The cash-first governor fixes its recommendation for new paid warming to `false`.
- The dominance certificate states only whether the zero-add-on path is economically dominant under stated assumptions. It cannot buy anything.
- Any decision to buy a paid warm-up add-on is an owner purchase decision outside these layers. It needs separate budget authority and its own record.
- If an add-on is already active, the governor's required action is to review the existing cost with the owner before any cancellation.

## 4. Unattended execution

No cron job, scheduler, worker, API route, `server.mjs`, `worker.mjs`, operator script or founder-interactive command may import or call these modules. Wiring any of them unattended is a defect, and the reachability ratchet is the guard that catches it.

## 5. Stop and escalate to the owner when

- a step needs a credential, a secret value, a live provider account or a payment method;
- the pending migration is about to be applied anywhere other than the isolated test database or an owner-authorized runner;
- a purchase, renewal or cancellation of any warm-up add-on appears in a plan;
- a schedule or unattended path is proposed for any module in section 1.

## 6. Verification

```
timeout 300 node --test tests/reachability-ratchet.test.mjs tests/production-coverage-ratchet.test.mjs
node -e 'JSON.parse(require("fs").readFileSync("config/reachability-classification.json","utf8"))'
```

Both commands must pass before any gate state is claimed. A passing ratchet proves only that the classification is complete and that nothing unattended reaches these modules. It proves nothing about inbox placement, reputation, deliverability or economics.

## 7. References

- `docs/UBERWARM2_REAL_SEED_EXECUTION_2026-10-12.md`
- `docs/UBERWARM3_ZERO_PAID_WARMUP_EFFECT_FIREWALL_2026-10-12.md`
- `docs/UBERWARM6_ECONOMIC_DOMINANCE_THEOREM_2026-10-12.md`
