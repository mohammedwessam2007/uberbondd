# Kilimanjaro — AI Revenue Ops vertical-density tournament

Date: 2026-08-28
Issue: #75

## Method

This is a **workflow-density tournament**, not a TAM forecast and not a willingness-to-pay claim. Each dimension is scored 0–5 from current observable workflow evidence, then weighted to 100 points:

- inbound lead value 12%;
- missed-call loss 10%;
- appointment/no-show economics 8%;
- quote/estimate lifecycle 10%;
- review importance 7%;
- recurring communication volume 7%;
- software fragmentation/integration surface 5%;
- observable existing software spend 8%;
- regulatory ease 8%;
- sales-friction ease 5%;
- attach rate across the ten automation mechanisms 10%;
- recurring-revenue fit 5%;
- low founder/support burden 5%.

Unknowns lower a score. Vendor claims and vendor case studies prove workflows exist; they do not prove the claimed uplift will reproduce for UberBond.

## Top 10

| Rank | Vertical | Evidence-weighted workflow score /100 | Main reason | Main penalty |
|---:|---|---:|---|---|
| 1 | HVAC / plumbing / electrical home services | **91** | urgent inbound demand + quotes + scheduling + reviews + payments + repeat service | telecom/seasonality and field-software integrations |
| 2 | Auto repair/service | **87** | estimate→approval→repair→payment→follow-up is an unusually complete causal chain | shop-system integration and service-specific data |
| 3 | Roofing | **82** | high-value leads and estimate follow-up make response/follow-up economically legible | less frequent recurring appointment/communication than dental/auto |
| 4 | Medspa/aesthetics | **82** | lead conversion + appointments + reminders + reviews + reactivation + memberships | health/privacy and claims/compliance burden |
| 5 | Dental | **80** | scheduling + reminders + recall + reviews + payments + front-office communication | patient-data/privacy/integration burden |
| 6 | Property management | **78** | lead-to-lease + resident communication + payments + maintenance + renewals | long workflows, tenant/owner complexity, incumbent platforms |
| 7 | B2B agencies/professional services | **75** | lead follow-up + proposals + CRM + reporting + recurring retainers | missed-call/appointment/field-estimate modules attach less naturally |
| 8 | Legal | **73** | intake + consultations + reminders + CRM + payments + reviews | conflict/privacy/professional-rule burden and trust-heavy sales |
| 9 | Real-estate sales teams | **73** | lead response + appointment + nurture + CRM + reviews | outcome timing and attribution are noisy; transactions are episodic |
| 10 | Salons/spas | **72** | appointments + reminders + re-engagement + memberships + reviews | lower average economic loss per missed interaction and strong incumbents |

Close but outside the top ten: general clinics (72; clinical/privacy burden), accounting/advisory (70; proposal/payment automation is strong but missed-call/appointment density is lower), gyms/fitness studios (69; strong retention/membership workflows but lower lead/estimate density).

## Winner — urgent home services

**Winner: HVAC / plumbing / electrical.** This is a bounded hypothesis winner for the first commercial experiment, not a claim that buyers have accepted UberBond.

Why it clears the tournament:

1. **Response speed is economically visible.** Jobber's 2026 home-service report says more than half of customers expect a response within an hour, while HVAC operators in the survey were among the slowest responders. That is unusually clean evidence for missed-call/lead-response automation.
2. **Estimate follow-up is a native workflow, not a made-up pain.** Jobber documents automatic quote follow-ups; ServiceTitan explicitly describes tracking, following up and converting estimates through CRM and downstream scheduling/invoicing.
3. **The bundle attaches densely.** Missed-call text-back, lead follow-up, appointment reminders, estimate follow-up, reviews, re-engagement, CRM/event lineage and dashboard/proof all fit one customer journey.
4. **Regulatory burden is lower than healthcare/legal.** The system still needs consent, telephony and marketing compliance, but it avoids clinical patient data and legal-conflict/professional-practice boundaries.
5. **A win/loss can be attributed.** Lead → booked job → estimate → approval → invoice/payment is more measurable than vague awareness or content outcomes.

### Winner bundle

**Revenue Recovery Bundle**

`missed call/new lead → instant eligible response → booking → reminder → estimate → estimate follow-up → won/lost → review request → re-engagement → payment/outcome dashboard`

Initial wedge: **missed-call recovery + estimate follow-up**. The other modules should attach only after event access and buyer evidence justify them.

## Top-three bundle designs

### 1. HVAC / plumbing / electrical — Revenue Recovery Bundle

Modules: missed-call text-back, lead follow-up, appointment reminders, estimate follow-up, review management, re-engagement, CRM/event lineage, dashboard.

Why a bundle beats one automation: every module consumes the same identity, phone/email, job/estimate, suppression and outcome state. One shared event spine lets UberBond measure whether a missed call became a booked job and whether an outstanding estimate became paid work instead of reporting vanity activity.

### 2. Auto repair/service — Approval & Bay-Fill Bundle

Modules: lead/missed-call follow-up, appointment reminders, digital-estimate follow-up, declined-work re-engagement, review requests, CRM, payment/outcome dashboard.

Current evidence is unusually direct: Shopmonkey describes a single workflow from scheduling through inspection, estimate, text approval, repair order, invoice, payment, follow-up and reporting; declined work is explicitly tracked for follow-up. This gives UberBond a strong observation/attribution surface without inventing a new business process.

### 3. Dental — Front-Office Recovery Bundle

Modules: online booking/lead response, appointment reminders, one-click recall/re-engagement, review management, payment requests, CRM/patient-event bridge and dashboard.

NexHealth currently packages scheduling, one-click recall, communications, reminders, reviews, payments and ledger sync. That proves the workflow bundle is coherent. It also proves UberBond should integrate rather than rebuild a dental PMS. Patient data and healthcare privacy make this a second-wave vertical until the exact data boundary is professionally reviewed.

## Minimum-field evaluation notes

- **HVAC/plumbing/electrical:** strongest combined response + estimate + review + scheduling density. BUILD first experiment.
- **Roofing:** excellent high-value estimate funnel and review importance; fewer repeat service/appointment triggers. BUILD adjacent after the shared home-service spine.
- **Dental:** excellent appointment/recall/review/payment density; PARTNER/INTEGRATE for PMS and keep patient data minimized.
- **Medspa:** very high appointment/re-engagement/review density, but health/privacy/marketing-claim boundaries increase support and legal review. RESEARCH_MORE before activation.
- **General clinics:** similar front-office density with even stricter clinical/privacy constraints. DEFER until health-data boundary is deliberately designed.
- **Legal:** strong intake/consultation/follow-up/review/payment surface; conflict checking and professional obligations raise integration/sales burden. RESEARCH_MORE.
- **Accounting/advisory:** recurring billing/proposal and advisory-retainer economics are attractive; Ignition's current customer evidence shows firms automating signed engagements, billing and recurring payments. The ten-offer attach rate is lower than home services. RESEARCH_MORE.
- **Auto services:** very dense estimate/approval/payment/follow-up loop and lower regulatory burden. BUILD second.
- **Property management:** high communication/lead-to-lease/payment/renewal density, but operational scope is broad and incumbent systems are deeply embedded. PARTNER/INTEGRATE.
- **Real-estate sales:** high lead-response/nurture need but long, noisy attribution and episodic transactions. RESEARCH_MORE.
- **Gyms/fitness:** memberships, booking, reminders, retention and marketing are coherent; mature all-in-one software and lower estimate/missed-call density weaken the wedge. DEFER.
- **Salons/spas:** appointments, memberships, reminders, marketing and reviews are coherent, with current all-in-one software starting around low hundreds/month/location. DEFER until a sharper revenue-loss wedge exists.
- **Agencies/B2B professional services:** CRM, lead follow-up, proposals, reporting and recurring retainers fit, but the owner-supplied local-business ten-pack does not attach as densely. Keep as a separate B2B motion, not the first vertical.

## Current source register — accessed 2026-08-28

Home services:
- Jobber 2026 Home Service Trends Report: https://www.getjobber.com/home-service-trends-report/
- Jobber quote follow-up guidance, updated 2026-06-19: https://www.getjobber.com/academy/contracting/how-to-price-a-job-as-a-contractor/
- Jobber platform: https://www.getjobber.com/
- ServiceTitan HVAC estimating: https://www.servicetitan.com/industries/hvac-software/estimating
- ServiceTitan plumbing estimating: https://www.servicetitan.com/industries/plumbing-software/estimating
- Housecall Pro pricing: https://www.housecallpro.com/pricing/

Auto:
- Shopmonkey 2026 comparison, published 2026-07-22: https://www.shopmonkey.io/blog/best-auto-repair-shop-management-software-2026-top-picks-compared
- Shopmonkey estimates: https://www.shopmonkey.io/demo-estimates
- Shopmonkey product: https://www.shopmonkey.io/

Dental:
- NexHealth pricing/products: https://www.nexhealth.com/pricing
- NexHealth front office: https://www.nexhealth.com/
- NexHealth Synchronizer: https://www.nexhealth.com/features/nexhealth-synchronizer

Medspa / salon / fitness:
- PatientNow medspa CRM review, 2026-04-21: https://www.patientnow.com/resources/compare/best-medical-spa-crm
- Mangomint pricing update, effective 2026-08-01: https://www.mangomint.com/blog/pricing-update-2026/
- Mindbody salon cost, updated 2026-07-16: https://www.mindbodyonline.com/business/education/blog/what-mindbody-really-costs-salons
- Mindbody fitness/wellness ROI, updated 2026-08-21: https://www.mindbodyonline.com/en-gb/business/education/blog/real-roi-mindbody

Legal:
- Clio pricing/current suite: https://www.clio.com/pricing/
- Clio legal CRM: https://www.clio.com/features/legal-crm-software/
- Clio appointment booking: https://www.clio.com/features/appointment-bookings/

Property management:
- Buildium pricing: https://www.buildium.com/pricing/
- AppFolio marketing/leasing: https://www.appfolio.com/property-manager/marketing-leasing
- AppFolio pricing: https://www.appfolio.com/pricing

Accounting/B2B:
- Ignition Hungerford case, 2026-07-09: https://www.ignitionapp.com/customers/hungerford
- Ignition Night Owl CPA case, 2026-08-20: https://www.ignitionapp.com/customers/night-owl-cpa
- HubSpot customer platform pricing: https://www.hubspot.com/pricing/suite

## Kill conditions for the winner

Do not promote the home-service winner beyond research/preparation if any of these hold:

- no lawful source of buyer/prospect evidence;
- no authoritative missed-call/lead/estimate state can be integrated without credential sprawl;
- the customer already has equivalent automation enabled and no measurable gap exists;
- telecom/sender constraints make the intended response channel unsafe;
- buyer interviews/transactions fail to support a positive contribution margin after provider, setup, support and founder time;
- attribution cannot distinguish recovered revenue from work that would have closed anyway.

## Terminal truth

`ISSUE_75_TOURNAMENT_COMPLETE__HOME_SERVICES_HYPOTHESIS_WINNER__BUYER_PROOF_EXTERNAL`

The winner is a research conclusion. It is not a customer, a sale, a TAM estimate or permission to contact anyone.