# UberBond Free Runtime Mission Clock

A standalone Cloudflare Workers + SQLite-backed Durable Object runtime for proving bounded, persistent UberBond mission-clock liveness without a permanent VM.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mohammedwessam2007/uberbondd/tree/main/deploy/cloudflare-free-runtime)

## What it proves

- the Worker is reachable;
- a Durable Object can persist mission-clock state;
- a bounded active mission window can schedule 1-second alarms for up to 8 hours;
- tick count and last-tick time survive ordinary isolate sleep/wake cycles.

It deliberately has `externalEffectAuthority: NONE`. It does not authorize outreach, spending, payments, contracting, publishing, account actions, or any other external consequence.

## Endpoints

- `GET /health` — Worker reachability only.
- `GET /status` — current mission-clock state.
- `POST /start` — start a bounded clock. JSON body: `{ "intervalMs": 1000, "durationMs": 28800000 }`.
- `POST /stop` — stop the clock and delete the next alarm.

The policy refuses sub-second cadence and mission windows longer than 8 hours.

## Local verification

```bash
npm install
npm test
npm run dev
```

## Direct deployment

```bash
npm install
npm run deploy
```

Cloudflare's Deploy-to-Cloudflare flow treats this directory as an isolated Worker project and can provision the Durable Object binding from `wrangler.jsonc`.

## Truth boundary

A healthy mission clock proves runtime liveness and persistence only. It does not prove that UberBond performed commercial work, that a customer accepted delivery, or that any money cleared.
