# First Customer Playbook

A step-by-step operational guide to going from a deployed system to your first
paid transaction. This is about **operating** the engine, not building it.

## The revenue ladder (what you're actually selling)

| Tier | Price (default) | Purpose |
|---|---|---|
| Free Opportunity Snapshot | $0 | Lead magnet: one evidence-backed finding + private report link |
| Full Digital Audit | $49 one-time | First self-serve digital sale, no call needed |
| Strategy Audit | $299 one-time | Human review + prioritized roadmap |
| UberBond Watch | $99/mo | Recurring monitoring, change history |
| Implementation Sprint | from $1,000 | Done-for-you build of the top fix |

The realistic **first dollar** comes from the Full Audit ($49) or, more often for
a first customer, an Implementation Sprint booked off the back of a free snapshot
that genuinely impressed them. The free snapshot is the wedge — everything hinges
on it looking sharp and being obviously true.

## Choose your launch surface

- **Fastest / zero-cost:** Cash Engine Lite (`lite/`). Vercel + Neon + GitHub
  Actions, no Stripe, no monthly bill. Ideal for the very first customer. Follow
  [`DEPLOY_CASH_ENGINE_LITE_IPAD.md`](DEPLOY_CASH_ENGINE_LITE_IPAD.md). Payment is
  handled manually (you invoice the lead).
- **Full engine:** the production Revenue Engine with hosted checkout, durable
  queue, discovery, and outbound safety. Follow [`docs/DEPLOY.md`](docs/DEPLOY.md)
  and [`ENVIRONMENT_VARIABLES.md`](ENVIRONMENT_VARIABLES.md). Use this once you
  want automated checkout and volume.

Both deliver the same audit brain. Start on Lite unless you already need automated
payments.

## Pre-launch checklist (full engine)

- [ ] `NODE_ENV=production`, `STORE_BACKEND=postgres`, `DATABASE_URL` set, SSL on.
- [ ] `web` and `worker` deployed as **separate** services (production refuses `all`).
- [ ] `ADMIN_TOKEN` is 32+ random chars and stored only in the host secret manager.
- [ ] `APP_BASE_URL` is your real `https://` domain.
- [ ] `/api/health` returns `{ ok: true }` and shows a worker online.
- [ ] Submit your **own** website through the public form and confirm a report renders end-to-end.
- [ ] Outbound stays **off** (`OUTBOUND_ENABLED=false`) until you have explicitly completed the outbound-safety setup — the first customer does not require it.

## The first-customer motion

1. **Pick 10 real prospects you can reach personally.** Clinics or considered
   brands with visibly weak websites. Personal warm outreach beats cold volume for
   customer #1.
2. **Run each through the free snapshot yourself** (submit their URL). You now hold
   a private report link per prospect with a real, evidence-backed finding.
3. **Reach out with the finding, not a pitch.** Lead with the single most valuable
   observation and the private report link. "I ran your site through our audit and
   found X — here's the evidence." Specific and true, never generic.
4. **Let the report do the selling.** The report page ends in clear next-step
   offers. Interested leads either self-checkout (full engine) or reply asking for
   implementation (both surfaces).
5. **Convert to a paid tier.** For customer #1, the Implementation Sprint or
   Strategy Audit is the most natural first paid step because it's high-value and
   conversation-led.

## Taking the first payment

- **Full engine:** connect Lemon Squeezy hosted checkout by setting
  `FULL_AUDIT_CHECKOUT_URL` (and strategy/monitoring URLs) plus
  `LEMONSQUEEZY_WEBHOOK_SECRET`. The report's "Unlock" buttons then route to real
  checkout, and paid webhooks unlock the full report automatically.
- **Cash Engine Lite / manual:** when a lead requests implementation, you invoice
  them directly (bank transfer, PayPal, Wise — whatever you already use). No
  processor is wired in by design. Deliver, then collect.

## Delivering the work

- The audit already produced the evidence (findings, screenshots, prioritized fix
  list). For an Implementation Sprint, execute the top finding's recommended
  service and show before/after.
- For a Strategy Audit, layer human prioritization on top of the automated
  findings and hand over a short roadmap.

## Day-one operations

- **Monitor** the admin command center (`/admin.html`, gated by `ADMIN_TOKEN`):
  inbound leads, reports ready, queue health, paid orders.
- **Watch the worker.** `/api/health` shows worker online + active jobs. On Lite,
  the GitHub Actions run log shows each audit and any pending leads.
- **Never lose a lead.** Leads persist in the database even if email notifications
  are unconfigured; on Lite they're also printed in every Actions run.

## Honest expectations

The software makes delivery cheap and credible; it does not manufacture demand.
The $200/day target is a business goal, not an output guarantee. Customer #1 comes
from you putting a genuinely useful, specific finding in front of the right person
— the engine's job is to make that finding fast, evidence-backed, and trivial to
act on.
