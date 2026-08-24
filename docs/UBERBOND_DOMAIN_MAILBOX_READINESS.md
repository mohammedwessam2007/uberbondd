# UberBond Domain and Mailbox Readiness OS

Live activation mission (nightshift): make UberBond capable of using owned
sending domains as legitimate outreach infrastructure and, only if a real
provider account is authorized and connected, start real native mailbox
warm-up. The owner has now supplied the exact outreach targets
`uberbond.agency` and `uberbond.cloud`. Those names are owner evidence only;
there is still no provider/registrar receipt in UberBond, so the honest,
tested, structurally-enforced result remains blocked — not a website, not a
simulation, and not a claim of live warm-up.

## 1. Current-state map (before this wave)

| Item | Status |
|---|---|
| SendingDomain / SendingMailbox canonical records | **Missing** — did not exist |
| DNS verification | **Missing** |
| Provider adapter contract | **Present as a deny-only 22-capability contract**; no live Maildoso adapter is connected |
| Warm-up orchestration | **Missing** |
| Domain/mailbox circuit breakers | **Missing** |
| Domain/mailbox deny-only gate composing with Deliverability Guard/V9 | **Missing** |
| Beginner control center / operator action card | **Missing** |
| Existing Deliverability Guard (`src/deliverability-guard.mjs`) | **Already implemented and tested** — a different, narrower model: 2 fixed inbox slots (`A`/`B`) over Gmail OAuth, not a general domain/mailbox system. Reused conceptually (fail-closed pattern, receipt discipline); not modified. |
| `src/send-safety.mjs` | **Already implemented and tested** — contact/evidence/country/business-hour eligibility. Unrelated to domain/mailbox readiness; untouched. |
| OMNIA/V9 (`src/consequence-boundary.mjs`) | **Already implemented and tested**, off by default. This wave's gate composes with it (deny-only) but does not wire into `Pipeline.maybeSend` — there is no live domain/mailbox-based send path yet to gate. |
| `accounts` / `senderHealth` collections | **Already implemented**, inbox-slot-scoped (`A`/`B`). Deliberately not reused as the SendingDomain/SendingMailbox model — that model needs to represent an open set of domains/mailboxes across providers, which the 2-slot schema cannot express. Both collections are untouched. |
| Provider credentials | **Missing** — no Maildoso/API, Instantly, Google Workspace, or Microsoft 365 credential is configured. |
| Purchased GoDaddy domain names | **Owner-supplied: `uberbond.agency`, `uberbond.cloud`** — exact targets are known, but ownership/provider/DNS evidence is not connected. |
| Real, live DNS resolution capability | **Confirmed real** — `node:dns/promises` was tested against a real public domain in this sandbox this wave (`resolveMx`/`resolveTxt` both returned real records). This is a genuine, live-capable socket, not a simulation — see "Live DNS proof" below. |

## 2. What this wave built

Nine new modules, one deny-only gate composing with existing safety
primitives, nine new job handlers, one scheduler hook (off by default), 71
hostile deterministic tests, and capability-graph entries for all of it.

| Module | Role |
|---|---|
| `src/sending-domain-registry.mjs` | Canonical SendingDomain record. Append-only-receipt-over-auditLog (same pattern as `commercial-memory.mjs`/`commercial-outcome.mjs`) — no second mutable data store. 13-state machine exactly matching the mission's `SENDING_DOMAIN_STATES`. |
| `src/sending-mailbox-registry.mjs` | Canonical SendingMailbox record, same pattern. **Hard invariant, tested**: registration and every event-recording function reject outright (not silently strip) any field whose name looks like a secret — password, token, API key, refresh/access token, client secret, private key, SMTP password. `logSendingMailboxEvent` throws rather than persist one as defense in depth. |
| `src/provider-adapter-contract.mjs` | The versioned capability interface (22 capabilities) every real provider adapter must implement, plus `createUnconfiguredProviderAdapter()` — a deterministic fixture where every capability call reports `PROVIDER_AUTH_REQUIRED`. `resolveProviderAdapter(cfg, provider)` is the single function anything in this system may use to decide "is a provider connected." No real Instantly/Google Workspace/Microsoft 365 HTTP client exists — building one against a live API with no credential to test it against would itself be an unverified-code fabrication risk, which this mission explicitly forbids. `redactProviderReceipt()` strips secret-shaped keys and truncates/caps everything else before any provider response is ever persisted. |
| `src/dns-verification.mjs` | Read-only, **live-capable** DNS verification (MX, SPF including duplicate-record detection, DKIM, DMARC + policy, custom tracking CNAME). Uses real `node:dns/promises` by default; the resolver is injectable so every automated test stays network-free. Never guesses a DKIM selector or an SPF include — reports `BLOCKED` for that specific check when the provider's own requirement contract doesn't supply one, and the overall domain status can never exceed `BLOCKED` when the provider's full DNS contract is unknown. |
| `src/warmup-orchestrator.mjs` | Warm-up start/reconcile decision logic, driven only by real provider adapter responses. A gradual, capped ramp schedule (`plannedWarmupCapForDay`) that structurally cannot reach a large volume on day one. Fails closed to `WARMUP_ACTIVE` if a provider claims `WARMUP_COMPLETE` before the configured minimum period (default 14 days) has elapsed — a provider's own optimism is not trusted over policy. |
| `src/domain-mailbox-circuit-breaker.mjs` | Pure decision function covering every pause trigger the mission listed (SPF/DKIM/DMARC/alignment failure, DNS evidence expiry, lost mailbox authentication, unknown provider health, bounce/complaint rate thresholds, provider rate limit, duplicate reservation, uncertain provider outcome, suppression integrity, secret-in-log, provider contract change, domain reputation, cap exceeded, V9 bypass attempt). Callers persist the resulting pause through the registries. |
| `src/live-activation-gate.mjs` | The Live Activation Rule (mission section 8) as one function, returning exactly one of the 9 defined final states. Never fabricates a receipt; `LIVE_WARMUP_ACTIVE` is only ever returned alongside a real (redacted) provider receipt. |
| `src/domain-mailbox-gate.mjs` | Deny-only pre-check composing with (never replacing) the existing Deliverability Guard and OMNIA/V9. Its passing result is explicitly named `NOT_BLOCKED_BY_DOMAIN_MAILBOX_GATE`, never `ALLOW`, so it cannot be mistaken for authorization by any future caller. |
| `src/domain-mailbox-control-center.mjs` | The beginner "Domain and Mailbox Readiness" dashboard and the one-page operator action card, both read-only and both incapable of showing a green check without a backing recorded event. |

Wired into `src/job-handlers.mjs` as 9 handlers under the `domainMailbox.*`
namespace (register domain, register mailbox, verify DNS, request warm-up,
reconcile warm-up, evaluate circuit breaker, evaluate gate, evaluate
activation, build dashboard). One new scheduler hook
(`domainMailbox.warmup.reconcile`, hourly) exists but is off by default
behind `cfg.domainMailbox.schedulingEnabled` (env `DOMAIN_MAILBOX_SCHEDULING_ENABLED`),
matching the existing Prometheus scheduling pattern.

## 3. Live DNS proof (not simulated)

Before writing any code this wave, real DNS resolution was tested directly
against a real public domain in this sandbox:

```
node:dns/promises resolveMx('gmail.com')  -> real MX records returned
node:dns/promises resolveTxt('gmail.com') -> 4 real TXT records returned
```

This confirms `src/dns-verification.mjs`'s default resolver is a genuine
live socket in this environment, not a placeholder. No real domain name is
hardcoded anywhere in source — that proof was run ad hoc in a shell, never
committed to a file, per the mission's "never hard-code domain names" rule.
Whenever the owner registers a real purchased domain, `verifySendingDomainDns()`
will check its actual public DNS for real, tonight, with no further
engineering required.

## 4. Current external activation decision

The smallest-fit provider candidate for this two-domain canary is Maildoso
monthly SMTP infrastructure. Its current public product and pricing pages say
that existing domains can be connected, SPF/DKIM/DMARC can be automated,
mailboxes can be created, API/MCP access exists, and cold sending is capped at
15 messages per mailbox per day. These are `CREATOR_CLAIM` inputs until
UberBond records real provider and DNS evidence. The public standard packages
start at 30 mailboxes/$75 per month, which is intentionally too large for this
first canary; the exact custom two-mailbox price must be read inside the
provider account.

The current owner gate is therefore: exactly two mailboxes, one per supplied
domain, monthly only, with a hard ceiling of $15 USD/month and no domain
purchase. No provider credential is currently configured, and no Maildoso
adapter is live in UberBond.

Google Workspace/Gmail API remains restricted to solicited, consented, or
requested-information routes by `docs/outreach/PROVIDER_POLICY_BOUNDARY.md`;
public business contact evidence alone does not unlock generic cold outreach.

Sources reviewed: <https://maildoso.ai/>,
<https://maildoso.ai/pricing>, and <https://developers.maildoso.com/>.

## 5. Why every path ends in BLOCKED tonight

Every real requirement chain converges on the same true bottleneck:

```
domain ownership (owner-supplied names; provider/registrar evidence missing)
  -> mailbox provider (MISSING -- no provider credential configured)
  -> MX/SPF/DKIM/DMARC (cannot verify without an exact domain)
  -> warm-up (cannot start without an authenticated provider connection)
  -> V9 authorization / controlled outreach (moot -- nothing upstream is ready)
```

`evaluateLiveActivation()` is deterministic and tested against exactly this
shape of input (registered domain/mailbox, unconfigured provider) and
returns `BLOCKED_PROVIDER_AUTH` — proven by
`tests/domain-mailbox-readiness.test.mjs`'s job-handler end-to-end test, not
asserted by hand.

## 6. What the owner needs to do (max 3 actions, see final report)

1. Authorize the bounded Maildoso purchase described above and provide its
   API credential through the protected deployment secret channel.
2. Once authenticated, let UberBond connect the two exact domains, read the
   provider-issued DNS contract, and prepare verification. Never paste a
   secret into chat or a repository file.
3. Once provider and DNS evidence exist, the real provider adapter is the next
   engineering gate; this wave intentionally did not claim a live adapter
   against zero credentials (see `src/provider-adapter-contract.mjs`).

## 7. What was explicitly NOT done, on purpose

- No website, no Vercel domain attachment, no landing page, no frontend
  hosting change of any kind.
- No real Maildoso/Instantly/Google Workspace/Microsoft 365 HTTP client — only
  the interface + fixture, per the mission's own instruction for an
  unconfigured provider.
- No DNS record was added, changed, or removed — `src/dns-verification.mjs`
  has no write capability at all.
- No account created, no KYC, no credential change, no money spent, no
  message sent to any third party.
- `src/deliverability-guard.mjs`, `src/send-safety.mjs`,
  `src/consequence-boundary.mjs`, and every existing test were read but not
  modified. `lite/` is unchanged (verified via `git status --short lite/`
  after every commit this wave).
