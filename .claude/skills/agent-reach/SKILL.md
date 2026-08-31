---
name: agent-reach
description: Use Agent Reach as a Prometheus/world-sensing supplier when an UberBond mission needs lawful public or explicitly authorized web/social/niche-source research. Read/search only by default. No login-cookie use, CAPTCHA/access bypass, private-contact inference, or write actions.
metadata:
  upstream: Panniantong/Agent-Reach
  source-ref: 06c202b03400a7d31886bf4399213706da1a0324
---

# Agent Reach — UberBond public research integration

Agent Reach is a multi-platform research capability router. UberBond uses it as one optional supplier beneath the Company Brain and Prometheus, never as authority to access private sessions or violate platform controls.

Read before use:
- `UBERBOND_CANON.md`
- `docs/AI_SKILL_PLUGIN_ASSIMILATION_CANON.md`
- `artifacts/external-skill-plugin-registry.json`
- `src/external-capability-control-plane.mjs`

## Default scope

Allowed default mission class:

`PUBLIC_OR_EXPLICITLY_AUTHORIZED_READ_ONLY_RESEARCH`

Before use, apply the `agent-reach` branch of the external capability control plane. If the source requires login, private browser sessions/cookies, CAPTCHA/access bypass, or unclear authorization, the default decision is DENY/REVIEW rather than silent escalation.

## Safe host setup

Upstream currently documents:

```bash
pipx install https://github.com/Panniantong/agent-reach/archive/main.zip
agent-reach install --env=auto
agent-reach doctor --json
```

The first `install --env=auto` is a check-only/default path. Do **not** use `--system` or optional login-backed channels from this UberBond skill unless a separate owner-authorized setup mission explicitly permits the host mutations and the data/access policy is reviewed.

## Routing

Read the matching reference when needed:
- [search](references/search.md): public web search.
- [social](references/social.md): public social/community sources with strict login boundary.
- [career](references/career.md): public jobs/LinkedIn research.
- [dev](references/dev.md): GitHub/code research.
- [web](references/web.md): web pages and RSS.
- [video](references/video.md): public video/podcast metadata/transcripts where lawful.
- [finance](references/finance.md): public market/company information, never financial execution.

## Research contract

For every material result preserve:
- source/platform;
- public/authorized access basis;
- URL or stable identifier when available;
- observed/published time when material;
- extracted claim vs inference;
- evidence freshness;
- contradiction/corroboration status.

Reachability is not permission. A public contact route is not consent. A platform adapter existing is not evidence that its current use complies with platform policy.

## Forbidden by default

- automatic login or account creation;
- harvesting browser cookies/private sessions;
- CAPTCHA/access-control bypass or fingerprint evasion;
- rotations designed to evade blocks/rate limits;
- private-contact inference;
- posting, commenting, liking, messaging or other writes;
- using the tool to contact prospects/customers;
- representing scraped discussion as verified demand/revenue.

Use built-in connected tools/web search instead when they provide a safer or more authoritative source for the same mission.
