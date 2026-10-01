# UberWarm² Capability Donor Synthesis

Date: 2026-10-01  
Truth class: CLEAN-ROOM CAPABILITY SYNTHESIS + SOURCE IMPLEMENTATION. No provider purchase, DNS mutation, credential entry, external seed-network creation, or real message send is claimed.

## Mission

Internalize every useful software mechanism surrounding sender reputation, warm-up, placement observation, provider integration, and bounded ramping so UberBond buys only the irreducible reputation-bearing transport/mailbox substrate.

This is a **capability-atom synthesis**, not a trade-dress clone and not a copy of protected/private implementation.

Canonical boundary:

`RENT REPUTATION-BEARING TRANSPORT -> OWN THE REPUTATION CONTROL PLANE -> LET RECIPIENT NETWORKS SUPPLY REALITY`

## Donor doctrine

External products and repositories are treated as donors and benchmarks.

Allowed:
- independently reproduce useful workflows/mechanisms;
- reuse compatible open-source code only when license obligations are satisfied;
- preserve provenance and source revision;
- benchmark competing approaches;
- combine useful atoms into a provider-neutral design.

Rejected:
- private/proprietary source;
- credentials, private datasets or customer material;
- branding/trade dress;
- license stripping;
- provider-policy bypass;
- fake engagement intended to defeat receiver anti-abuse systems;
- claims that synthetic traffic manufactures recipient-network trust.

## Donor ledger

### Warmbly

Source: `warmbly/warmbly`  
Observed revision during this synthesis: `bada69a408f510f0bca6f4027a0c1473adc9cd65`  
License observed: Apache-2.0, copyright 2026 Mindroot Ltd.

Useful atoms extracted:
- reputation state is per mailbox rather than one account-wide binary;
- ramp and cold-send capacity are different controls;
- partner diversity matters more than a tight reciprocal loop;
- placement seeds should remain independent from warm-up participants;
- health-band quarantine/recovery;
- placement evidence is more decision-useful than open-rate vanity;
- rolling-window bounce/complaint/spam-placement observations;
- durable reputation history should survive tier/provider changes;
- provider/message-ID rewrites require explicit correlation logic;
- control plane and execution plane should remain separable.

UberBond realization:
- `UberWarm²` composes observed placement with sender-health/ramp decisions;
- `UberPlacement` keeps seed inboxes owner-controlled and separate from synthetic traffic;
- `UberWarm` quarantines adverse observations and refuses to treat missing evidence as healthy;
- `UberQuality` keeps infrastructure capacity subordinate to quality-preserving capacity.

Code-copy classification: **NO WARM BLY SOURCE COPIED INTO THESE NEW MODULES.** The implementation is clean-room JavaScript over existing UberBond primitives. Apache-2.0 provenance is retained as donor evidence in case a later mission chooses direct code reuse.

### WarmGrid

Source: `FassihShah/WarmGrid`  
Observed LICENSE blob: `acf770e0f7c1ac51ed2b5a626b4bbe9fd99f02f5`  
License observed: MIT.

Useful atoms extracted:
- explicit scheduler/ramp state;
- per-mailbox health scoring;
- blacklist observations as one signal among many;
- content deduplication;
- seed inventory as a distinct operational object;
- SMTP and IMAP are enough to build a provider-neutral observation loop.

Explicitly rejected atoms:
- automatic synthetic replies as a reputation shortcut;
- automatic spam/junk rescue as a way to manufacture positive engagement;
- a closed seed loop presented as equivalent to organic receiver trust.

UberBond realization:
- keep scheduling, health, dedupe and observability ideas;
- reject fake-engagement mechanics;
- use real owner-controlled seed observations plus real campaign outcomes.

Code-copy classification: **NO WARMGRID SOURCE COPIED INTO THESE NEW MODULES.** MIT permits reuse, but clean-room implementation keeps UberBond architecture coherent and avoids importing unnecessary application surface.

### Winnr

Source class: external provider / potential transport supplier.  
Role: **supplier + API donor, not UberBond's brain.**

Official open-source integration donor inspected:
- repository: `winnr-app/winnr-mcp`;
- license: MIT, copyright 2026 winnr-app;
- LICENSE blob observed: `945527f5007f4eb09f121448638fcbb67384e0ce`;
- export tool blob observed: `bcec6bccd5600ee264bb16cd057d8ee876222d1c`;
- domain tool blob observed: `54cbacdf3b26cfa5f9c6163e47a84981ef8b3625`;
- mailbox tool blob observed: `6e3e3caa7dd1cf4c40b262257693c7ff14021f21`.

That code confirmed the exact interoperability contracts used by UberBond rather than forcing us to guess them: `POST /v1/domains/connect` with `manual_dns`, `GET /v1/domains/{id}/dns-records`, `POST /v1/domains/{id}/verify-dns`, `POST /v1/email-users`, `POST /v1/email-users/bulk`, `GET /v1/export/formats`, and `POST /v1/export` with `format` plus exactly one selector such as `domains`, `emails`, or `getAllDomains`.

Useful atoms extracted from public provider documentation:
- API-first mailbox provisioning;
- SMTP/IMAP credential portability;
- asynchronous bulk provisioning jobs;
- signed webhooks;
- event IDs for deduplication;
- Message-ID mapping for provider relays;
- domain-ready / DNS-failed events;
- bounce/complaint/inbound events;
- optional paid warm-up rather than making warm-up a prerequisite to API transport.

UberBond realization:
- `src/uberwinnr-adapter.mjs` wraps the documented provider boundary;
- every provider write requires explicit per-call authority;
- an uncertain consequential write never blind-retries;
- webhook signatures are independently verified;
- provider event facts become evidence, never automatic outreach authority;
- provider warm-up add-on is optional because UberWarm² owns the evidence ramp.

No Winnr proprietary implementation is copied. UberBond's adapter remains independently implemented in JavaScript. The MIT-licensed official MCP server is preserved as a provenance donor and authoritative interoperability reference.

### Winnr official MCP expansion

Further first-party inspection of the official MIT repository added exact source evidence for the broader operational boundary:

- `client.py` `09744c56544739f0b7d79cc6744150efa6b0726d`: one bounded automatic retry only for idempotent GET requests on HTTP 429;
- `domains.py` `54cbacdf3b26cfa5f9c6163e47a84981ef8b3625`: BYO/manual DNS, DNS reads, provider detection and explicit purchase confirmation;
- `email_users.py` `6e3e3caa7dd1cf4c40b262257693c7ff14021f21`: mailbox create/list/update/delete + bulk creation;
- `export.py` `bcec6bccd5600ee264bb16cd057d8ee876222d1c`: write-scoped password export and one-selector contract;
- `webhooks.py` `af11d0136e456a534de6034c55acc9de593d4620`: HTTPS webhook requirement, event allowlist, delivery history and secret boundary;
- `inbox.py` `4a2e941963c526241f518cba042a61e99d12bba7`: inbox read/reply interoperability;
- `jobs.py` `44ce37e8a83750858f6e73aa47cd0b73b376a308`: async-job reconciliation and timeout semantics;
- `warming.py` `ece966717ae0782fbac38a95a8e5a72355ee1df4`: optional $0.60/mailbox/month warming purchase surface;
- `prewarmed.py` `72affbb2aa0b5ec179df51283af010b46953e942`: pre-warmed marketplace, $3/address/month, 3-address minimum, no base plan, health/blocklist reads and explicit purchase confirmation. Its docstrings say **no minimum term / cancel any time**, but current Winnr Help pages linked by support say **90-day minimum term**. That contradiction is preserved and purchase-blocking rather than silently reconciled;
- `account.py` `9fd4722e2262d73eadca907b8abd04cf89ca40c3`: plan/subscription/usage introspection.

New internalized atoms:
- read-like POST calls are distinguished from consequential writes without exposing a generic bypass;
- raw provider calls cannot self-label a mutation as read-only;
- credential export fails closed unless exactly one selector is supplied;
- webhook creation fails locally unless HTTPS and an official event are used;
- live account, job, inventory and blocklist reads can reconcile state before any retry or purchase;
- a low-cost **pre-warmed bridge** can be compared against Startup without making the provider's marketplace UberBond's permanent identity layer.

Economic consequence from dated public prices:
- 3 pre-warmed addresses = $9 first month and nominally 30–45 cold messages/day at Winnr's written 10–15/day recommendation; current Help pages imply a $27 minimum committed spend if their 90-day rule governs;
- 20 addresses = $60/month and nominally 300/day;
- 23 addresses = $69/month and nominally 345/day;
- above that point the $69 Startup plan is cheaper recurring on public list price, but its fresh mailboxes still need real reputation evidence.

UberBond therefore treats pre-warmed inventory as a **first-cash candidate bridge**, not the final sovereign substrate. The binding cancellation/minimum-term rule remains unresolved because official source and current Help pages conflict. No spend is allowed until that conflict and exact commitment are reconciled. The 30 owned UberBond outreach domains remain the long-run portable identity fleet.

### Warmup-network vendors generally

Useful atoms:
- distributed recipient-network observations;
- placement probes;
- gradual ramping;
- longitudinal sender history.

Rejected conclusion:
- a vendor-reported "warm" state is not proof of universal inbox placement;
- SMTP acceptance is not inbox placement;
- a large synthetic network is not a replacement for real prospect response/complaint outcomes.

## UberWarm² architecture

```
REAL TRANSPORT / MAILBOX PROVIDER
          |
          v
       UberSMTP
          |
          +--------> owner-controlled placement seeds
          |                  |
          |                  v
          |            UberPlacement
          |                  |
          +------------------+
                             v
                         UberWarm²
                             |
          +------------------+------------------+
          |                  |                  |
      UberWarm           UberQuality        UberEgress
          |                  |                  |
          +------------------+------------------+
                             |
                       governed cap
                             |
                       UberReach / V5
```

## Evidence-ramp state machine

1. **BLOCKED**: authentication/provider authority missing.
2. **WARMING**: no recipient-network placement evidence yet. Cold cap = 0.
3. **LIMITED_CANARY**: some real placement exists, but conditioning/sample/provider diversity remains incomplete. Default evidence canary cap = 2/day.
4. **RAMP**: clean observed placement + bounce/complaint evidence permits one bounded increment.
5. **HOLD**: healthy at current observed/policy ceiling.
6. **QUARANTINED**: complaint, hard-bounce, spam-placement, low-inbox-placement, uncertain provider outcome, or duplicate-reservation signal crosses policy.

The state machine does not auto-rescue spam, auto-reply to manufacture engagement, or create authority.

## What remains irreducibly external

Software cannot create:
- a provider account that exists and is paid;
- the provider's SMTP/IMAP infrastructure;
- IP/domain reputation inside Gmail, Microsoft, Yahoo, Apple or corporate filters;
- owner-controlled accounts on recipient networks unless those accounts actually exist;
- elapsed reputation history;
- campaign-specific legal/provider eligibility;
- recipient decisions, replies, complaints, purchases or cleared revenue.

Those are **evidence inputs**, not missing UberBond SaaS modules.

## Procurement consequence

Once this branch is verified and merged, an outreach transport candidate no longer needs to bundle a paid warm-up network.

Minimum transport contract:

- authorized for the intended traffic;
- configured and actually provisioned;
- outbound SMTP;
- inbound IMAP/replies or forwarding;
- portable domain/mailbox identity;
- current provider policy evidence.

Provider warm-up becomes an **optional experiment**, not a mandatory dependency.

## Exact new source

- `src/uberwarm2-sovereign-ramp.mjs`
- `src/uberwinnr-adapter.mjs`
- `src/uberwinnr-credential-import.mjs`
- upgraded `src/uberwarm-reputation-lab.mjs`
- upgraded `src/uberbuy-outreach-bom.mjs`
- focused hostile/regression tests for the above.

## Truth boundary

This synthesis can remove software dependency. It cannot guarantee deliverability, provider continuity, recipient-network reputation, campaign legality, prospect response, or revenue. Those remain reality-coupled observations.
