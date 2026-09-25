# UberBond Night War — final report

Date: 2026-09-25 (UTC) · Branch: `claude/uberbond-night-war-launch-glgsqc` · Base: `main` @ `aa037a0`
External effects tonight: **0 messages, 0 DNS changes, 0 purchases, 0 spend, 0 provider writes.**
Cleared revenue: **$0.** Customers: **0.**

## 1. Verdict

**Round 3 update:** every gap closable from the repository is closed (§1c). The $0 path now runs end to end: print cards with verifiable findings and a code, the prospect asks for the report on the site (optionally ticking follow-up consent), and follow-up email goes out only under that consent. What remains is founder-only (§7) or reality.

**Round 2 update:** there is now a first-cash path that needs no server and no spend (§1b, Track A in §7). The cold-email machine below is still valid, but it is now Track B.

No email can lawfully leave UberBond tomorrow. Nothing in the software is still missing for a small first batch. What stands between now and a first batch is three founder actions: buy the server, create a DNS credential, and fill one facts file. Every step after those is now one command.

Tonight closed the software gaps that would have blocked first cash even after the server existed:

1. **Nothing decided whether a recipient may lawfully be emailed.** The final launch gate refused every recipient with `recipient-legal-eligibility-not-passed`, and no code produced a PASSED decision. Now a per-recipient eligibility engine does (§4.1).
2. **The DNS writer could destroy live records.** Publishing SPF would have overwritten an unrelated root TXT record (such as a site-verification token) or created a second SPF record. Fixed (§4.2).
3. **Only 2 of the 30 outreach domains could send.** The mail-cell bootstrap could only create Postal domains for `uberbond.agency` and `uberbond.cloud`. Now any of the other 28 can be added, so sending reputation spreads across the portfolio instead of concentrating on two domains (§4.5).
4. **Nothing turned the bring-up output into published DNS.** After purchase, someone would have hand-typed about 21 records. Now it's one command (§4.6).
5. **The founder-only inputs were scattered across 5 gates.** Now they're one file (§4.4).
6. **DNS state was "UNKNOWN" for all 30 domains.** It is now observed live (§3).

## 1b. Round 2 (same night): a lawful path to first cash that needs no server

The first round made cold email possible once a server exists. The harder truth is that cold email may never be lawful for this sender. An Egypt-based sender holds every cold recipient under PDPL Articles 17–18. Germany, Switzerland and Saudi Arabia reject cold email outright. No free transport permits it, and Netcup's terms are unverified. So the second round asked GENESIS (and the 890 founder moonshots) for mechanisms that make the prospect's own action the permission:

| Invention | Moonshot ancestors | What it does | State |
|---|---|---|---|
| **Consent receipts** | #161 Consent Protocol, #67 Trust Compiler, #465 | Replaces the intake's bare `consent: true` with a sealed receipt: exact wording hash, purpose, channel, time, double opt-in for marketing, time-ordered withdrawal | Built; wired into the live intake code |
| **Consent Bridge invitations** | #161, #160 Authority Physics, #464 | Typeable codes (`XXXX-XXXX-XXXX`) handed through a letter, partner, in-person meeting or your own network. The prospect asks for their own report, which creates the permission. | Built; the intake form records `?code=` for attribution |
| **Lawful Channel Router** | #790 Monoculture Detector, #107 Matter Router, #1 Causal Compiler | For each prospect: every route with its legal state and cost. Cold email only when eligibility PASSED; otherwise a consent-creating first touch. It names exactly what would unlock a held route. | Built |
| **Evidence Beacon** | #306 Proof-of-Value, #67, #146 Knowledge Packet | The pitch is the prospect's own verifiable findings from UberBond's auditor, with no revenue claims. Nothing real to show means no invitation. | Built |
| **GENESIS burst + Wallbreaker** | 12 generators, 890-corpus ancestry | 12 candidates recorded in the GENESIS index (4 realized, 4 routed or waiting, 4 hypotheses) plus a Wallbreaker tournament | Receipts committed |

Proof that it changes outcomes, as tested:
- A German recipient with an Egypt-based sender is **rejected** for cold email, but becomes **eligible** after a confirmed double opt-in.
- An Egypt-based sender's US prospect routes to letters only after a recorded counsel confirmation; until then it gets inbound content only, and the router names that one missing fact.

**Wallbreaker tournament** (no spend, no deploy tonight, economics honestly unknown):
- **Selected:** remove the parking page from `uberbond.cloud` and keep the before/after receipts (1 founder minute).
- **Fallbacks:** offer decision, partner introductions, founder network, hiring-signal research.
- **Rejected:** the Netcup cold canary (spend, and it relies on the now-falsified "cold email is the only channel" assumption), letters (spend), and the public deploy (your authority).

**First GENESIS probe:** hiring-signal chemotaxis over public job postings: `PARTIAL_SUPPORT`. There were 13 US postings, about 4–6 from small agencies by name, but no website field and an empty UK query. Receipt: `artifacts/genesis/GENESIS_OUTREACH_PROBE_HIRING_SIGNAL_20260925.json`.

## 1c. Round 3: closing the remaining gaps (founder: "close all the gaps, minimal cost")

| Gap | What was wrong | Now | Commit |
|---|---|---|---|
| `main` was red | 4 suites failed before tonight's work. The 890-moonshot corpus: every shard had lost its trailing newline. Causal compiler v1: the test asserted a 10× win, but the repo's own result file records the falsifier firing at 5×. Reachability: 33 modules had merged unclassified. | Shards restored to their exact manifest hashes; the test now holds v1 to its recorded outcome (a mutation that lowers the threshold fails it); 30 research canaries and UberWatt classified. **8,137 tests: 8,081 pass, 54 skipped, 2 fail.** Both failures are the one owner gate in §8.10. | `451ef3d` |
| Laptop agent safety | `scripts/uberworm-agent-v2.mjs` executed queued commands without the policy module written for it | It refuses anything outside the documented contract (allowlist, id shape, 6-hour expiry, approved models) before executing | `451ef3d` |
| UberInboxes covered 2 of 30 domains | 16 identities on the two roots only | Both planners take the fleet; the apply script shares the mail cell's selection (`ALL` = every fleet name). **30 domains × 8 founder aliases = 240 identities.** The default plan and its digest are unchanged. | `3dec16d` |
| Two permission systems | UberAttention permits and consent receipts were separate objects | A consent receipt is now the evidence behind an UberAttention permit. It is re-derived at the moment of use, so a withdrawal after issuance still refuses. | `26f5909` |
| Router restated other organs | Own monoculture threshold; ignored UberReach and consent | A redeemed code routes to **CONSENTED_EMAIL** (beats every cold route; only the consented purpose). A supplied UberReach email endpoint must be fresh and unsuppressed. Concentration uses the control plane's 50% cap. | `0bbc148`, `93f3040` |
| No way to capture follow-up consent | The public form had one box (report delivery only), so the consented route could never open | An optional, unticked second box shows the registered `report-follow-up-v1` wording and records its own receipt only for a literal `true` | `93f3040` |
| No way to produce the first touch | Codes existed, but nothing printed them with evidence | `npm run outreach:bridge-letters` routes each business, reads its public pages (robots respected), keeps only verifiable findings, and writes a printable card or letter file with code, stop route and sender identity to `~/.uberbond`. `npm run outreach:bridge-attribute` matches exported leads to codes. Tested through the real HTML crawler against a live local site. | `93f3040` |

**Cost floor (cash, first period):**

| Path | Cash | What it needs | Reach |
|---|---|---|---|
| **Hand-out cards** (Track A) | **$0** (home printer) | Live audit page, launch facts, invitation secret | Businesses you can visit; ~15 founder minutes each (router estimate) |
| Posted letters | Postage per letter (`--postage-cents`) | The above, plus a counsel confirmation if you send from EG/SA/AE | US/GB/CA/AU businesses |
| Owned mail cell (Track B, **paused**: Netcup prohibits bulk mailing) | **€29.52** (Netcup VPS Lite, 6-month minimum at the observed €4.92/month, 0% VAT display; account total unobserved) | Terms check, PTR, port 25, DNS credential | Tens of recipients in month 1 (modeled) |
| Payment rail | $0 upfront. Lemon Squeezy checkout links are already reconciled by `api/webhooks/billing.mjs`; a fee per sale | A checkout URL in `FULL_AUDIT_CHECKOUT_URL` (founder account) | Deferred until the first "yes" |

Nothing else is a mandatory purchase: no mailbox SaaS, sequencer, lead database or AI subscription.

## 2. Current verified state

| Component | Claimed before tonight | Verified tonight | Evidence |
|---|---|---|---|
| Domains owned | 30 (registrar UI, 09-20) | 30 resolve in public DNS, all on GoDaddy nameservers | `artifacts/outreach/fleet-dns-observation-2026-09-25.json` |
| MX / SPF | unknown | **0 / 30** | same |
| DKIM | unknown | **0 / 30** (no selector exists; no mail host) | same |
| DMARC | unknown | 30 / 30 carry GoDaddy's default `p=quarantine` with reports sent to GoDaddy. Setup must **replace** it; a second DMARC record would make the policy invalid. | same |
| Outreach-domain websites | unknown | 28 / 28 show GoDaddy parking | same |
| `uberbond.cloud` apex | outreach domain (activation card; founder confirmed 2026-09-25) | Returns **both** Cloudflare hosting and GoDaddy parking addresses, so a recipient or filter that opens the domain sometimes gets a parking page | same |
| `uberbond.agency` apex | outreach domain (activation card; founder confirmed 2026-09-25) | Served through Cloudflare (a hosted page, not parking). No role contradiction: all 30 domains are outreach domains. | same |
| Mail server (Netcup) | in cart (09-24, €4.92/month billed €29.52 per 6 months, 0% VAT display) | **not purchased**; no IP, no PTR, no port 25 | PR #993; no receipt |
| Mailforge pilot (10 inboxes) | "staged" | **no evidence it was bought** | no receipt found |
| Cold-capable transport | none | none. The repo's own registry shows 0 of 16 reviewed free sending services permit cold B2B. | `npm run outreach:free-first:doctor` |
| Netcup's terms on unsolicited advertising email | not checked | **UNKNOWN.** The terms page is blocked from this environment. Netcup is a German host. | §7, owner action 1 |
| First-cash gate | `NO_CONTACT_PERMITTED` | unchanged: 6 gates unsatisfied | `node scripts/first-cash-canary-packet.mjs` |
| Payment | sandbox only | Live credentials missing. Checkout existing is not cleared payment. | `node scripts/payment-rail-doctor.mjs` |
| Offer prices | 450 / 900 / 950 / 750 in code vs founder-recalled >$1,000 | **unresolved.** Both lineages preserved (PR #993); now a single field in the facts file. | §5 |
| Repository visibility | — | **public.** Launch facts and prospect data must never be committed; `launch-facts*.json` is gitignored. | GitHub metadata |

## 3. Barrier graph (first cash backwards)

| Node | Status | Class | What closes it |
|---|---|---|---|
| Cleared payment | missing | PAYMENT | Deferred until the first buyer says yes. A manual invoice through the existing PayPal/Lemon Squeezy rails can clear first cash; live API credentials are needed later for automatic reconciliation. |
| Qualified buyer / reply | missing | EXTERNAL | Needs delivered outreach |
| Delivered outreach | missing | TRANSPORT | **Owner action 1** (server + host terms) |
| Sender authentication (MX/SPF/DKIM/DMARC) | 0/30 | DNS | **Owner action 2** (credential), then `npm run uberdoso:dns-publish` |
| PTR + outbound port 25 | unknown | NETWORK | Netcup control panel, inside owner action 1 |
| Mailbox identity on a fleet domain | built tonight | SOFTWARE ✔ | `UBERDOSO_POSTAL_SENDER_DOMAINS` |
| Recipient legal eligibility | **built tonight** | SOFTWARE ✔ | `npm run outreach:eligibility` |
| Sender legal identity (name, postal address, jurisdiction) | missing | OWNER_ONLY | **Owner action 3** |
| Offer choice | unresolved | OWNER_ONLY | **Owner action 3** (one field) |
| Canary authorization | missing | OWNER_ONLY | **Owner action 3** |
| Eligible prospect cohort | 0 | DATA | Automatic after action 3, built on the live control plane, never in git |
| Suppression, unsubscribe, bounce, reply classification, idempotent dispatch | built, tested in source | SOFTWARE ✔ (live 0) | First real test to founder-owned addresses |

Shortest path: **owner action 1 → bootstrap → owner action 2 → DNS publish → owner action 3 → test send to founder addresses → 20-recipient canary.**

## 4. What changed tonight (round 1: 8 commits; round 2: 7 more, listed in §1b and the git log)

| Commit | What |
|---|---|
| `b1294fb` | **Recipient eligibility engine** (`src/uberoutbound-recipient-eligibility.mjs`) wired into the launch gate and UberProspect |
| `8ecc857` | **DNS safety:** TXT records reconciled by purpose (SPF / DMARC / DKIM / other); mail routing never changed silently; the whole plan is refused before any write |
| `d16dc80` | **Fleet DNS observatory** plus the live receipt for all 30 domains (`npm run outreach:fleet-dns`) |
| `7f84ceb` | Stale startup-config test brought in line with the explicit outbound-provider rule (it failed on `main`) |
| `41f57ce` | Readiness and constitution files regenerated with the canonical generators (they were stale on `main`). All 33 capability entries unchanged. |
| `25d2a3b` | **Mail-cell bootstrap takes outreach-fleet senders**, allowlisted and tested in real Ruby |
| `015c945` | **Launch-facts intake** (`npm run outreach:launch-facts`) |
| `aef2993` | **One-step DNS publication** from the bring-up receipt (`npm run uberdoso:dns-publish`) |

### 4.1 Recipient eligibility engine (replaces blanket refusal with precise rules)

It decides one recipient at a time from supplied facts and returns ALLOW / ALLOW_WITH_REQUIREMENTS / HOLD_FOR_REVIEW / REJECT. Each decision names the rule, the regulator source and the obligations the message must carry. A decision becomes `legal.status = PASSED` only when every obligation is evidenced.

- **US:** CAN-SPAM rules for business recipients. Checks the postal identity, truthful headers, a non-deceptive subject, identification as an ad, and an opt-out honoured within 10 business days. Addresses scraped automatically from a site that says it doesn't share them are refused. ([FTC guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business))
- **GB:** PECR corporate subscribers only. Sole traders need consent. Named employees also need a legitimate-interests assessment reference and a privacy notice. ([ICO B2B](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/), [ICO PECR email](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-direct-marketing-using-electronic-mail/how-do-we-comply-with-the-pecr-electronic-mail-marketing-rules/))
- **CA / AU:** "conspicuous publication" implied consent only when three things are verified: the address was published, no statement refuses unsolicited messages, and the message is relevant to the recipient's role. Australia also refuses automated address harvesting. ([CRTC](https://crtc.gc.ca/eng/com500/guide.htm), [ACMA](https://www.acma.gov.au/avoid-sending-spam))
- **Rejected:** DE, CH, SA. **Held for review:** FR and the rest of the EU/EEA, AE, EG, and every jurisdiction not encoded.
- **Sender jurisdiction is required.** An Egypt-based sender holds all cold traffic, because Egypt's PDPL (Law 151/2020, Articles 17–18) regulates electronic marketing with consent and licensing ([law text](https://mcit.gov.eg/Upcont/Documents/Reports%20and%20Documents_1232021000_Law_No_151_2020_Personal_Data_Protection.pdf)).
- **These always win:** suppression, guessed addresses, system mailboxes, missing or stale provenance, and a transport whose terms forbid cold B2B.
- UberProspect now requires this evidence-bearing decision instead of a bare `legalEligible: true`.
- UberDoso's permissioned-relationship policy is unchanged.

This is encoded regulator guidance, **not legal advice**. Anything uncertain holds for human review.

### 4.2–4.6 Other capabilities

- **DNS adapter:** GoDaddy's default DMARC is replaced, not duplicated. Unrelated TXT records survive. Two existing SPF records cause a refusal instead of adding a third. Changing an existing MX needs an explicit flag.
- **Observatory:** a failed lookup is recorded as "incomplete", never as "absent". A domain is never reported as an authenticated sender without observed DKIM.
- **Launch facts:** one file outside the repo (mode 0600). Address authorization must be explicit, and placeholder evidence doesn't count. Any of the 30 owned outreach domains is accepted as a sender; any other domain is refused. It warns up front when the sender jurisdiction or a recipient jurisdiction will hold cold traffic.
- **More sending domains:** the Postal cell always provisions `uberbond.agency` and `uberbond.cloud`. `UBERDOSO_POSTAL_SENDER_DOMAINS=uberbondhq.site,...` adds any of the other 28 to the cell and its DNS plan. The default topology digest is byte-identical to `main`.
- **DNS publication:** host receipt → UberDoso kernel plan → GoDaddy provider plan plus verifier contracts. Dry run by default. `--apply` requires `--owner-authorized` and `GODADDY_PAT`. It refuses without a matching PTR, a static IPv4, or Postal DKIM for every domain.

## 5. Test results

- New or changed suites, all passing: eligibility 14/14, DNS adapter 7/7, observatory 5/5, launch facts 5/5, DNS publication 4/4, UberDoso kernel 9/9, mail-cell bootstrap 6/6, UberLaunch closure 5/5, input config 4/4.
- **Mutation checks** (a protection deliberately removed, and a test must fail): 23 of 25 caught. Eligibility 14/14, DNS 4/4, observatory 2/2, provisioner 1/1, kernel 1/1. The original adapter fails 4 of the new DNS safety tests.
  - Two backstop checks in the DNS publication bridge (records outside the owned zones; verifier-contract failure) are unreachable with valid kernel output, so their mutations were not caught. They are defence-in-depth, not tested protections.
- **Full deterministic suite on this branch (before the fixes):** 8,013 passed, 8 failed, 54 skipped.
  - 7 of the 8 failed identically on a clean `main` worktree.
  - 1 (`worker-context-admission`) failed only because the working tree was uncommitted; it passes once committed.
  - This branch fixed 3 of the `main` failures: canon freshness, constitution freshness and input config.
  - Still failing on both `main` and the branch, all in GENESIS/moonshot work outside outreach: `causal-compiler-canary-v1`, `founder-moonshot-literal-corpus` (2) and `reachability-ratchet` (32 unclassified GENESIS modules; the list is byte-identical on `main` and this branch).
  - **Final full suite on branch head `ee6f769`: 8,090 tests; 8,032 passed, 4 failed, 54 skipped.** The 4 failures are exactly the GENESIS/moonshot failures listed above, which also fail on `main`.
- `npm run check:syntax`: 2,343 files parse.
- **Round 2:**
  - New suites, all passing: consent receipts 9/9, consent bridge 7/7, channel router 7/7, evidence beacon 3/3, GENESIS outreach burst 5/5.
  - Mutation checks: 24 of 24 protections caught, after two survivors exposed missing tests that were then added (wording drift; a partner agreement without the partner's own relationship).
  - The GENESIS index doctor reports 3 healthy bursts and 48 candidates.
  - **Full suite after round 2:** 8,121 tests; 8,062 passed, 54 skipped, 5 failed. Four are the GENESIS/moonshot failures that also fail on `main`. The fifth, `worker-context-admission`, refuses to run on a dirty working tree, and I was editing this report during the run; it passes on the committed tree.

## 6. Scoreboard (evidence-backed only)

| Item | Value | Evidence |
|---|---|---|
| Domains inventoried | 100% (30/30) | registrar receipt 09-20 plus live DNS 09-25 |
| DNS authenticated | 0% (0/30) | live DNS |
| Mailbox identities operational | 0% | no mail host |
| Inbound routing | 0% | no MX anywhere |
| Outbound transport | 0% | no host; terms unverified |
| Reply / suppression / unsubscribe | source built and tested; 0% live | test suites; no live traffic |
| Eligible prospect corpus | 0 | none imported |
| Offer truth | unresolved | two lineages |
| Payment path | sandbox only; 0% live | payment-rail doctor |
| First-cash loop | 0% | `NO_CONTACT_PERMITTED` |
| **Monthly verified capacity** | **0** | — |

**Monthly modeled capacity (not live):**

- 100k/month means messages, not prospects. With a 3-touch sequence that is about 33k unique prospects a month.
- At roughly 4,500 sends per business day, 30 domains × 3 identities × about 50/day matches the plan. That figure is a planning heuristic, not a measured limit.
- Reaching it needs more than one mail cell and IP, plus a real ramp. **Level 1 is a 20-recipient canary; every level up requires observed bounce, complaint and reply evidence.**

**Budget bands:**

- **$0:** verified capacity 0; no permitted cold transport.
- **≤$30/month:** one Netcup cell (€29.52 per 6 months), usable only if its terms, PTR and port 25 pass. Modeled first month: tens of recipients.
- **≤$100/month:** a second cell plus separate IP reputation. Modeled only.

## 7. Owner action queue (max 3 at once)

Two tracks. **Track A starts now and needs no server and no spend.** Track B, the cold-email machine, is queued behind it and only matters if Track A shows demand or cold email turns out to be lawful for you.

### Track A: now (max 3)

**A1. Stop a sending domain from showing a parking page** (1 min, $0; the Wallbreaker selection). Recipients and spam filters look at the sending domain, and `uberbond.cloud` currently shows GoDaddy's parking page to part of its traffic. In GoDaddy → My Products → `uberbond.cloud` → DNS, delete the `A` record `@` whose value is `Parked`, and leave the two Cloudflare `A` records. UberBond then reruns `npm run outreach:fleet-dns` and keeps the before/after receipts. The other 28 domains show parking pages too; once the GoDaddy credential exists (B2), point them at the same landing page before they send.

**A2. Fill the launch facts** (~10 min, $0). This also settles the offer price and your jurisdiction for both tracks.

On any machine with the repo, run `npm run outreach:launch-facts -- --init`, open `~/.uberbond/launch-facts.json`, and fill:
- legal name, postal address and `postalAddressAuthorized: true`;
- `publicFooterAuthorized: true`: the address appears in every email, as CAN-SPAM requires;
- `senderJurisdiction` (2-letter country);
- a monitored reply-to address;
- `offerLineage`: `CURRENT_FOUR_OFFER_GENOME` ($450 / $900 / $950 / $750; the only set already wired into reply lanes and delivery) or `HIGH_TICKET_LINEAGE` ($1,000–4,000 hypotheses);
- canary: `authorized: true`, `maxRecipients` (suggest 20), recipient countries (suggest `["US"]`), and an expiry date.

Run `npm run outreach:launch-facts` until it prints `LAUNCH_FACTS_COMPLETE`.

**If you send from Egypt:** the engine will hold every cold recipient until a lawyer confirms how PDPL Articles 17–18 treat B2B email. Say so, and the first-cash route shifts to opt-in and inbound channels instead of cold email.

**A3. Print and hand out 10 cards** (~1 hour including the visits, $0).
- **Confirm the site is live.** PR #1002 merged into `main` as `c922b43` on 2026-09-25. Once Render redeploys, `https://uberbond-control-plane.onrender.com/?code=ABCD-EFGH-JKMN` should show the pre-filled code field and the optional follow-up box. (This sandbox can't reach Render, so it wasn't checked from here.)
- **List the businesses** in `~/.uberbond/bridge-prospects.json`: `[{ "company": "...", "website": "https://...", "jurisdiction": "EG" }, ...]`. Up to 50; the file never enters git.
- **Print:** `UBERBOND_INVITATION_SECRET=<32+ random characters, keep them> npm run outreach:bridge-letters -- --site https://uberbond-control-plane.onrender.com`. It skips any business whose pages show nothing verifiable and writes `in_person-cards.html` plus `invitations.json` under `~/.uberbond/bridge/<date>/`.
- **Hand each card over in person** to the business. Handing it over by email or social message would make it an electronic message, and the email rules apply. For posted letters, add `--channel POSTAL_LETTER --postage-cents <cost>`; from EG/SA/AE the router also needs `--counsel-ref <your lawyer's confirmation>`.
- **Later:** download `/api/export.json` from the app and run `npm run outreach:bridge-attribute -- --leads <export.json> --invitations ~/.uberbond/bridge/<date>/invitations.json`.

### Track B: the cold-email machine (queued)

**B1 is paused: don't buy Netcup for outreach.** On 2026-09-25 a ChatGPT agent read Netcup's terms: "The following activities are expressly prohibited: 'Bulk mailing'". Its abuse guidance adds that spam sent through a customer application is stopped. The terms don't settle whether a few individually addressed B2B emails with an opt-out are allowed. An Egypt-based sender holds every cold recipient anyway, so a server bought for cold email now would sit idle. Track B resumes only when both change: a host whose terms explicitly permit this, and a sender jurisdiction or legal confirmation that lets cold recipients pass. Consented follow-up needs no dedicated server yet. The original steps are kept below for when that happens.

**B1 (original, on hold). Netcup: check the terms, then buy the server** (~25 min, €29.52 per 6 months plus any tax on the account-specific total)

a. Open https://www.netcup.com/en/terms-and-conditions and search the page for "spam", "advertis" and "E-Mail". If it forbids unsolicited advertising email, **stop and don't buy**; tell UberBond and the transport switches. If it allows individually addressed B2B email with an opt-out, continue.

b. Log in to the Customer Control Panel, review the cart (VPS Lite 1 G12.5s iv 6M, IPv4 + IPv6) and submit. The proof is the order confirmation plus the server's IPv4.

c. In Netcup's server control panel:
   - choose Ubuntu 24.04;
   - remove the default "Mail" firewall block ([Netcup firewall doc](https://www.netcup.com/en/helpcenter/documentation/server/firewall));
   - set the reverse DNS (rDNS/PTR) of the IPv4 to `mta.uberbond.cloud`.

   The exact button labels weren't verified from this environment. If Netcup refuses the rDNS until the forward record exists, first add one GoDaddy record: `uberbond.cloud` → DNS → Add → Type `A`, Name `mta`, Value `<server IPv4>`, TTL 600.

d. SSH in as root and paste:

```
apt-get update && apt-get install -y git
git clone --branch claude/uberbond-night-war-launch-glgsqc https://github.com/mohammedwessam2007/uberbondd /opt/uberbond-src
UBERDOSO_ADMIN_EMAIL='<your email>' UBERDOSO_POSTAL_SENDER_DOMAINS=uberbondhq.site bash /opt/uberbond-src/ops/sovereign/bootstrap-uberdoso-mail-cell.sh /opt/uberbond-src
bash /opt/uberbond-src/ops/sovereign/verify-uberdoso-mail-cell.sh /opt/uberbond-src > /root/uberdoso-verify.json
cd /opt/uberbond-src && node scripts/uberdoso-dns-publish.mjs --host-verification /root/uberdoso-verify.json --senders uberbondhq.site
```

The last command prints the exact DNS records and changes nothing.

**B2. GoDaddy: create a DNS API credential** (~5 min, $0)

Create a production API credential with DNS write access ([GoDaddy Domains API docs](https://developer.godaddy.com/en/docs/api-users/domains); DNS API access is now available with a single domain, per [GoDaddy](https://www.godaddy.com/resources/news/godaddy-dns-api-now-works-with-a-single-domain)). On the server only, never in chat, run:

```
GODADDY_PAT='<token>' node scripts/uberdoso-dns-publish.mjs --host-verification /root/uberdoso-verify.json --senders uberbondhq.site --apply --owner-authorized
```

The proof is `result.ok: true` plus the public DNS summary it prints.

## 8. Irreducible blockers

1. Server purchase and the host's terms: owner and external.
2. PTR and outbound port 25 on an assigned IP: physical.
3. DNS credential: owner.
4. Legal identity and sender jurisdiction: owner.
5. Offer choice: owner.
6. Real buyer demand: reality.
7. Live payment credentials: owner, deferred until the first "yes".
8. The Gmail connector in this session needs re-authorisation in claude.ai connector settings, so mailbox receipts (Netcup, Mailforge) couldn't be checked.
9. This environment's egress policy blocks the UberBond websites, Render and Netcup pages (DNS still works).
10. **The raw moonshot transcript in the repo is a 62,611-byte fragment** of the declared 189,166-byte source (sha256 `8a7be386…`). The 890 shards are intact and hash-exact; the transcript can't be rebuilt exactly because its trailing whitespace varies per line. Re-upload the original `Branch · Branch · New chat.txt` to `artifacts/research/founder-moonshot-literal-corpus/RAW_SOURCE_Branch_Branch_New_chat.txt` and the last 2 failing tests pass.
11. **Where the audit page lives:** the Vercel team has no projects; Render is the only recorded host and couldn't be checked from here. Deploying this branch is a merge decision (A3).

## 9. Invented / internalized / deleted

- **Invented (round 3):** printable consent-bridge letters and cards from Evidence Beacons, follow-up consent capture on the public form, consent-backed UberAttention permits (re-derived at use), the router's CONSENTED_EMAIL route, fleet-wide UberInboxes, and local enforcement of the UberWorm policy on the laptop agent.
- **Invented (round 2):** consent receipts, Consent Bridge invitations and attribution, the Lawful Channel Router, the Evidence Beacon, the GENESIS outreach burst and Wallbreaker receipts.
- **Invented (round 1):** the per-recipient lawful-eligibility engine, purpose-aware DNS reconciliation, the fleet DNS observatory, a one-file founder facts intake, fleet-sender mail-cell provisioning, one-step DNS publication.
- **Internalized (no SaaS needed):** DNS automation for mailbox providers, compliance classification, domain health observation.
- **Deleted:** nothing.
- **Superseded:** UberProspect's bare `legalEligible` boolean (now requires evidence). The intake's bare `consent` boolean is kept but no longer the evidence; the sealed receipt is.
- **Still recoverable:** all 30 domains, the Mailforge pilot plan, the Contabo cell path, the SES research, both offer lineages, and PR #993 / PR #972.

## 10. Next automatic steps

1. **After A1:** rerun the fleet observatory and store the before/after pair.
2. **After A3:** run `npm run outreach:bridge-attribute` over exported leads. Report links go out under the intake receipt; follow-up email goes out only through the router's CONSENTED_EMAIL route, which re-checks the receipts each time.
3. **After B1:** run the bootstrap/verify/publish sequence.
4. **After DNS:** run `npm run outreach:fleet-dns` until the sender domain shows `MX_SPF_DMARC_PRESENT_DKIM_UNOBSERVED`, then mark the domain verified in Postal.
5. **First real test to founder-owned addresses:** check headers, SPF, DKIM and DMARC, replies, bounces, unsubscribe and suppression.
6. **After A2 and B2:** build a 20-recipient cohort on the live control plane (never in git). Eligibility → UberProspect → launch gate → governed dispatch, with one authorization receipt per send.
7. **Measure:** delivery, bounce, reply, positive reply, unsubscribe, complaint, meeting, payment. Promote capacity only on observed evidence.
