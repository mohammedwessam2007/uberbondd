# UberBond One-Button Outreach Activation — 2026-09-15

## Purpose

Expose one founder-facing control that wakes the already-merged outreach organism without creating a second send engine or weakening the #875 launch/runtime evidence boundaries.

The control lives in `public/admin.html` and `public/outreach-one-button.js`.

## One press

The button performs this sequence:

1. authenticate with the existing in-memory owner bearer;
2. read `/api/summary` and `/api/campaigns`;
3. refuse unless live outbound is enabled, dry-run is off, there are zero uncertain send outcomes, and at least one non-system campaign is both approved and `autoSend=true`;
4. `POST /api/worker/resume`;
5. `POST /api/outbound/resume`;
6. `POST /api/run` with a bounded initial pulse of 250;
7. refresh the operator view.

## What it deliberately does not do

The one-button surface does not:

- mutate hosting environment variables;
- create or guess provider credentials;
- manufacture mailbox, DNS, warm-up, reputation, egress, transport, legal, contact-verification, or recipient-provider evidence;
- bypass suppression, unsubscribe, complaint, bounce, cooldown, sender-health, campaign, contact, legal or provider gates;
- send directly through Gmail, SMTP, Postal, Icemail, Mailforge or any provider;
- retry ambiguous external effects;
- persist `ADMIN_TOKEN` in localStorage, sessionStorage, IndexedDB, files, URLs, or logs;
- claim 100,000/day is physically live.

Provider dispatch remains downstream of the existing verified send machinery. The button only wakes and unpauses the already-authorized runtime.

## 100K/day doctrine

The initial `/api/run` pulse is intentionally bounded. Horizontal orchestration and the existing scheduler/worker machinery are responsible for continuing work. Volume remains subordinate to qualified eligible inventory, live sender/domain/egress capacity, recipient-provider budgets, suppression, reputation and campaign risk limits.

`100,000/day` remains the architecture capacity horizon, not a quota and not a claim of current live capacity.

## Owner-visible blockers

If the button refuses, its text surfaces the immediate blocker. Expected refusal classes include:

- live outbound disabled at the runtime boundary;
- runtime still in dry-run mode;
- one or more uncertain sends awaiting reconciliation;
- no approved auto-send campaign;
- authentication/API failure.

Those are genuine setup/runtime blockers. The button must not silently widen authority to make itself green.
