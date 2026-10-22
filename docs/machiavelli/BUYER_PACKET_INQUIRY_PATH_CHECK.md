# Buyer packet: Inquiry-Path Check (inbound, fixed price)

**Status:** BUYER-READY FOR INBOUND LISTING. **Unpublished.** Nothing is listed, sent or charged. Publishing a listing is public and needs the founder's own platform account, so it is the founder's action (see "To go live").
**Truth class:** offer design + working delivery code + illustrative sample. No buyer has seen it. Willingness to pay is untested. Cleared contribution profit: **$0.00**.

## Why this packet and not another

- Every other route in the repository is blocked by owner-only gates. #1538 §2 lists them: no collection account, no send authority with Egypt sender-side law unresolved, invoicing status unknown.
- A fixed-price service that buyers **buy inbound on a marketplace** needs no outreach, so the send-authority and marketing-law gate does not apply. The platform also collects the payment. What remains is the founder's own account, identity check and payout method.
- The deliverable already works:
  - existing read-only probe → extraction → coherence checks;
  - plus the new **declared-number reconciliation** (`src/declared-number-reconciliation.mjs`, 9 tests, mutation-checked) and an operator CLI (`scripts/inquiry-path-check.mjs`), smoke-tested live.
- It also fixes the experiment E1 failure (#1538): blind audits of strangers' sites came back clean about 49 times in 50, because a stranger cannot tell call tracking from an error.
  - Here **the buyer declares which numbers are theirs**, so "this button dials a number you did not declare" is a checkable fact on any site.
  - A clean result is a verified routing record, not an empty report.
- Rejected this session: Single Audit leads (X1 KILL), auditor-change early warning (S1 KILL), and the Apify breakage foundry (X2, see the receipt). The tracking-audit route is not packaged: no tracking capability exists yet, and its decisive experiment (E2) is assigned to the CP-02 worker.

## The offer

**Inquiry-Path Check: every call, call-button and published number on your site, verified against the numbers you say are yours.**

For home-service businesses (HVAC, plumbing, electrical, roofing) and the agencies that build and run their sites.

**You give us:**
1. your website;
2. the phone numbers that are yours, each with a purpose (main line, emergency, booking, each tracking number);
3. optionally, up to 10 pages that matter most (contact, booking, service-area pages).

**You get, within 2 business days, a report that:**
- lists **every call link** on the pages read, what it dials, and whether that reaches one of your numbers;
- flags any call button that **dials a number you did not declare** (old lines, retired tracking numbers, copy-paste errors);
- flags any of your numbers that is **printed but not tappable** on a phone;
- flags any number **search engines and AI assistants are told to call** that is not yours (structured data);
- flags **broken call links and forms that post to hosts that do not exist**;
- gives each finding a **30-second check** you can do yourself, plus the evidence (page URL, the exact code, and the page fingerprint at the time of the check);
- says plainly what it does **not** cover: answering, forwarding, ad accounts, logged-in pages;
- **never estimates "lost revenue."**

Sample (illustrative, fictional business, same code path as a paid report): [`samples/INQUIRY_PATH_CHECK_SAMPLE.md`](samples/INQUIRY_PATH_CHECK_SAMPLE.md).

**Acceptance and refund rule:**
- A finding counts only if its 30-second check reproduces it.
- If the buyer shows a finding does not reproduce, that finding is withdrawn.
- If no finding reproduces and the report is not a verified clean record, the order is refunded in full.
- A site we cannot read (bot wall, empty shell) is refunded in full and is never reported as clean. The code enforces this: `NOT_OBSERVABLE` renders "nothing was verified. This is not a clean result."
- One free re-check within 14 days after the buyer fixes something.

## Price

| Package | Price | Scope |
|---|---:|---|
| Single site | **$99** | up to 10 pages, 2 business days, one re-check |
| Agency 3-pack | **$249** | 3 client sites, same scope each |

**Why these numbers.**
- $99 matches the direct pilot price in #1535, so the same deliverable never carries two prices.
- Public comparables recorded in #1538: generic QA gigs around $50, form monitoring €10–$30 a month, GA4/Ads audits at $149 / $349.
- The declaration-based check sits between generic QA and tracking audits. These are hypotheses until a buyer pays.

**Unit economics.** These are scenarios, not forecasts. The probability of a sale is **UNKNOWN**.

| | Pessimistic | Base | Optimistic |
|---|---:|---:|---:|
| Platform fee (Upwork reported as 0–15% variable; some sources say flat 10%) | $14.85 | $9.90 | $0 |
| Withdrawal (Upwork direct-to-local-bank, $0.99 per a third-party source) | $0.99 | $0.99 | $0.99 |
| Contribution before founder time | $83.16 | $88.11 | $98.01 |
| Founder minutes per order (intake review, run, read the report, deliver) | 40 | 20 | 12 |
| Contribution per founder minute | $2.08 | $4.41 | $8.17 |

That compares with $0.34–$2.23 per minute for the direct cold-outreach pilot (#1538 §6), because inbound removes the prospecting and conversation minutes. Bank-side charges in Egypt are not included and are unknown.

## Delivery SOP (operator)

```bash
node scripts/inquiry-path-check.mjs \
  --site https://buyer-site.com \
  --declare "5125552671:main line" --declare "5125552477:emergency line" \
  --out-dir out/<order-id> --max-pages 10            # add --no-witness on a host without Playwright
```

- **Output:** `out/<order-id>/report.md` (the deliverable) and `receipt.json` (pages, hashes, read-only ledger: GETs, robots fetches, zero form submissions).
- **Before delivering:**
  - read every finding;
  - do its 30-second check yourself on a phone for each `VERIFIED_AGAINST_DECLARATION` finding;
  - leave out anything that does not reproduce.
- **The probe:**
  - respects robots.txt;
  - follows redirects by hand, public addresses only;
  - never submits a form.
- **Live smoke:** 2026-10-22, `example.com`, 1 GET + 1 robots request. Captured bytes matched the probe's page hash, and the verdict was `NOT_OBSERVABLE` as expected.

## Ready-to-paste listings (unpublished)

### Upwork Project Catalog

- **Title:** I will verify every call button and phone number on your service website
- **Category:** Web Development › QA & Testing (or the nearest QA category offered)
- **Tiers:**
  - Starter $99: 1 site, up to 10 pages, 2 days, 1 re-check.
  - Standard $249: 3 sites.
- **Description:**

> Your customers decide to call in a split second. If the button they tap dials an old number, a retired tracking line or a typo, that call is gone and nobody sees it happen.
>
> Tell me which numbers are yours. I check every call link, printed number and the phone number your site gives Google and AI assistants, on up to 10 pages, and show you exactly where anything dials or shows a number that isn't yours, which of your numbers can't be tapped on a phone, and any broken call links or forms.
>
> Every finding comes with the exact page, the code, and a 30-second check you can do yourself. If a finding doesn't reproduce, it's withdrawn; if nothing reproduces and the site isn't verifiably clean, you get a full refund. A clean result comes back as a page-by-page record of where every call link goes.
>
> I don't log in, submit forms or touch your accounts. I don't estimate "lost revenue": you get facts about your pages.

- **Buyer requirements:**
  1. website URL;
  2. your phone numbers with what each is for, including tracking numbers;
  3. optional list of pages that matter most.

### Contra service

Use the same title, description and price, as a fixed-price service. Contra is the collection route #1538 already selected; Contra support confirmed Egypt SWIFT payout, but the founder's account is not observed. Contra client-fee terms conflict across public sources ($29 per project vs a flat per-invoice fee; a possible August 2026 change), so **verify on contra.com before publishing**.

## To go live (owner-only; nothing else is missing)

1. Create or sign in to the platform account (Upwork and/or Contra) and complete its identity check.
2. Add a payout method and prove it with the first payout.
   - Upwork lists Egypt for direct-to-local-bank, but EGP availability is unconfirmed.
   - Contra: support-confirmed SWIFT.
3. Settle the invoicing and tax posture: W-8BEN for US-platform earnings, and ETA status. The checklist is in #1535.
4. Paste the listing and publish. Any platform review of the listing is outside this repository's control.

No outreach is required, so there is no send authority to grant.

## What would kill this packet

- **No inbound purchase within 60 days of a published listing.** Inbound demand at this price is then not proven; re-price or retire.
- **Buyers' own 30-second checks fail to reproduce more than 1 in 5 delivered findings.** Precision is then not good enough to sell; fix the extractor before relisting.
- **A platform rejects the listing category,** or the founder cannot obtain a payout method. That is a rail blocker, not an offer verdict.

## Founder-idea lineage

- **#0058 THE ERROR ECONOMY:** "reward people and systems for finding important errors before those errors become expensive."
- **#0146 THE KNOWLEDGE PACKET:** every finding carries evidence, provenance (page hash), its falsifier (the 30-second check) and its uncertainty status.
- **New descendant mechanism, buyer-declared truth as the reference frame:** a claim a stranger cannot verify becomes verifiable once the party who owns the truth declares it. It applies beyond phone numbers: declared prices, hours, service areas and licences can be checked the same way.

## Sources for platform facts (checked 2026-10-22, not founder-account-specific)

- [Contra client FAQ](https://contra.com:443/faq/clients/paid-projects)
- [Contra client fees help article](https://client-help.contra.com/en/articles/9708235-understanding-contra-s-fees-as-a-client)
- [PricingSaaS: Contra](https://pricingsaas.com/companies/contra)
- [goLance: Upwork fees 2026](https://golance.com/blogs/upwork-fees-explained-2026)
- [Skydo: Upwork fees](https://www.skydo.com/blog/upwork-fees-freelancers)
- [Raenest: Upwork fees for African freelancers](https://www.raenest.com/blog/upwork-fees-for-african-freelancers)
