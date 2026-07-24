# Owner Start Card

## What this is

A local, file-based operating system that turns a research pack (a list of agencies/prospects,
with source URLs and timestamps) into a paid diagnostic delivery, with every step short of your
own identity-bound approvals automated. Nothing sends, charges, refunds, or deploys by itself.

## Quick start

```bash
cd revenue-os
node scripts/generate-demo.mjs          # runs the full pipeline end to end against synthetic data
node scripts/cli.mjs status --store-dir demo-output/.store   # console summary (if you keep the store)
node scripts/cli.mjs render-dashboard --store-dir <your-store-dir> --out dashboard.html
```

Open `demo-output/owner-dashboard.html` in a browser to see the command center: your current
verdict, next 3 actions, active blockers, real scoreboard, and import status.

## The 7 decisions only you can make

Everything else is automated. These 7 are structurally gated to require you:

1. **Approve/reject an outbound message** (`approval.mjs#decideApproval`) -- nothing is sent
   without this.
2. **Resolve an ambiguous authorization** on a repair task (`implementation.mjs`) -- a task cannot
   start without an explicit `authorized: true` plus your name.
3. **Approve a repair / apply an implementation authorization** (`implementation.mjs`'s gate).
4. **Resolve a payment mismatch or apply an owner exception** (`payments.mjs#applyOwnerException`)
   -- the only way a payment reaches VERIFIED without matching evidence, and it always stamps a
   visible warning.
5. **Approve a contractor / repair assignment** (not yet built as a separate entity -- currently
   folded into the implementation authorization step above; see
   `UBERBOND_FIRST_PAYMENT_REVENUE_OS_IMPLEMENTATION_REPORT.md`'s honest-scope section).
6. **Approve a cancellation or refund** (`payments.mjs#refundPayment`,
   `monitoring.mjs#cancelMonitoring`).
7. **Acknowledge a severe blocker** (anything landing in the `blockers` collection / the owner
   command center's "Active Blockers" section).

## What is real vs. simulated right now

- **Real**: the store, migrations, scoring math, state machines, payment-evidence validation,
  report/proposal generation and signing, the check engine's logic, the scheduler's job-lifecycle
  guarantees (via the reused `DurableQueue`), the funnel math, the owner-action queue.
- **Simulated (fake/replay only, by design)**: every website check runs against a synthetic page,
  never a real URL. Every "send" is a local export or an in-memory fake, never a real email. Every
  payment is verified against operator-typed evidence text, never a real bank/PayPal/Payoneer API
  call. Every AI-assisted draft comes from a deterministic hash-based fake, never a real model call.

**To go live with any of the above, you would need to**: (1) wire a real crawler/browser provider
into `providers/crawler.mjs`'s contract, (2) wire a real email provider into `outbound.mjs`'s
contract and flip `REVENUE_OS_OUTBOUND_MODE`, (3) get real payment-provider API access or continue
with manual evidence review, (4) optionally wire a real AI provider into `providers/ai.mjs`'s
contract. None of this is done here -- doing it is a deliberate, separate decision, not a flag flip.

## Where the money math lives

- Diagnostic price: `$250` (`config.mjs#SERVICE_CATALOG.FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC`).
- Implementation default: `$1,000` (`AGENCY_IMPLEMENTATION_PACKAGE`).
- Monitoring: `$199-$499/mo`, inactive until you explicitly consent
  (`monitoring.mjs#activateMonitoring`).
- Margin floor: 30% by default (`REVENUE_OS_MARGIN_FLOOR_RATE`) -- a repair task below this margin
  is blocked from authorization, full stop.

## Honest limits (see the implementation report for the full list)

No live crawler, no live sending, no live payment API, no live AI, no live web server (CLI + static
HTML dashboard only), JSON storage backend only (Postgres migrations exist and are schema-verified
but the live Postgres backend itself isn't implemented this session), no XLSX import, no real
statistical significance testing for experiments.
