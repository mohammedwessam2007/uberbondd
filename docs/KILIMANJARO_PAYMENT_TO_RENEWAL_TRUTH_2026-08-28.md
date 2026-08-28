# Kilimanjaro — Payment → delivery → acceptance → renewal truth

Date: 2026-08-28
Issue: #79

## Terminal conclusion

The **local software truth chain is represented on current main**. A real economic chain is not yet proven because UberBond has zero real customers, zero cleared revenue, zero accepted deliveries and zero retained customers.

No synthetic fixture, checkout URL, internal delivery receipt, worker result or model judgment is permitted to advance those four facts.

## Canonical economic ladder

`OFFER_PREPARED → CHECKOUT_AVAILABLE → PAYMENT_INITIATED → CLEARED_PAYMENT → PAYMENT_RETAINED → DELIVERY_STARTED → DELIVERY_RECEIPT → CUSTOMER_ACCEPTED → SECOND_PAYMENT/RENEWAL → EXPANSION`

`PAYMENT_RETAINED` is deliberate. A provider-cleared payment that was later fully refunded is not retained economic value.

## Evidence required at every transition

| Stage | Durable evidence UberBond must hold | What does **not** prove it |
|---|---|---|
| OFFER_PREPARED | immutable ServiceSKU/offer id + version + scope + price classification + evidence class + authority | a creator price, model recommendation or editable draft |
| CHECKOUT_AVAILABLE | provider + store/product/variant/checkout identity + environment/test-mode + owner authority + creation receipt | a locally generated URL string or screenshot |
| PAYMENT_INITIATED | provider-origin order/checkout/subscription identity in pending/created state, with signed origin where webhook-driven | customer saying “I paid”; internal intent row |
| CLEARED_PAYMENT | the canonical three witnesses on the same provider event: provider/order state + payment classification receipt + revenue-ledger row, with amount/currency/product/prospect agreement | one ledger row; one webhook shape; test-mode fixture |
| PAYMENT_RETAINED | net cleared provider revenue after fully/partially witnessed reversals/refunds/disputes | gross first payment before reversal window/state |
| DELIVERY_STARTED | fulfillment plan bound to exact ServiceSKU/customer/scope/criteria + durable WORK_STARTED event | task creation or agent “DONE” |
| DELIVERY_RECEIPT | exact artifact refs + QA receipt + delivery event/version + no secret-bearing refs | file existence by itself |
| CUSTOMER_ACCEPTED | `EXTERNAL_CUSTOMER` evidence referring to the exact delivered scope/version/fulfillment identity | internal QA, employee/agent approval, no complaint |
| SECOND_PAYMENT / RENEWAL | a **new** provider payment/subscription invoice event, independently reconciled and retained, plus renewal linkage to the accepted fulfillment/customer | subscription flag alone; first payment replay; renewal reminder |
| EXPANSION | new scope/ServiceSKU or quantity + external acceptance/authorization + separate economic evidence | increased usage or a model saying the account can expand |

## Provider policy — current Lemon Squeezy facts

These are provider rules/documentation, not Egyptian law:

- Lemon Squeezy describes itself as the merchant of record: it handles end-customer payments and responsibilities including sales-tax collection, refunds/chargebacks and PCI obligations.
- Webhooks have a signing secret; requests carry an `X-Signature` HMAC that should be verified against the raw payload.
- Lemon's webhook developer guide recommends persisting incoming events and says non-200 responses are retried up to three additional times. Duplicate/replayed delivery is therefore a normal integration condition, not an edge case.
- Order status can be `pending`, `failed`, `paid`, `refunded`, `partial_refund` or `fraudulent`.
- Orders may be partially or fully refunded. Lemon also states it may issue refunds within 60 days to prevent chargebacks and can deduct refunds/dispute fees from future payouts.
- Subscription/order APIs and webhook events are provider state. They are not customer-acceptance evidence for a service deliverable.

This is why current UberBond code keys payment truth by provider event, verifies three witnesses, applies witnessed reversals, reports duplicates/contradictions and keeps `PAYMENT_RETAINED` separate from initial clearance.

## Egyptian tax/legal classification

### Confirmed from the Egyptian Tax Authority

The ETA's current FAQ says e-commerce, content-creator and freelance activities are dealt with under the Income Tax Law 91/2005, VAT Law 67/2016 and, for eligible participants in the simplified system, Law 6/2025; it explicitly says there is no separate tax law for these activities.

The same ETA FAQ currently states:

- electronic invoicing is the B2B system and cites Minister of Finance Decision 323/2022 for taxpayer participation requirements;
- the electronic receipt system is the B2C system and has its own participation conditions;
- the general compulsory VAT registration threshold is EGP 500,000, with stated exceptions for schedule goods/services and certain categories;
- ETA maintains an e-commerce platform and guidance for registration/identification with non-resident e-commerce platforms.

### Provider policy is not local tax clearance

Lemon Squeezy's merchant-of-record role can handle customer-facing sales tax/VAT in its transaction model. Lemon's own tax guidance simultaneously says the seller may still owe tax on income received through payouts and recommends country-specific tax advice.

Therefore **UberBond must not infer “Egypt tax handled” from `merchant_of_record=true`.**

### Professional-advice questions before real activation

These remain `PROFESSIONAL_ADVICE_REQUIRED` because the exact answer depends on the founder's legal/tax registration, contract structure, customer jurisdiction and provider relationship:

1. what legal/tax registration is required for the exact planned activity and expected turnover;
2. whether and how the exact B2B customer/provider arrangement enters ETA electronic-invoice/e-receipt obligations;
3. treatment and bookkeeping of merchant-of-record payouts, fees, refunds, foreign currency and business expenses;
4. which records must be retained and for how long;
5. whether a specific service/market/customer changes VAT or regulatory treatment.

The software should store the answer/attestation reference, not attempt to practice law.

## Current source-code reconciliation

### Payment truth

`src/payment-renewal-truth.mjs` is currently `payment-renewal-truth-1.6.0`. It recognizes cleared one-time/subscription classifications and reversal classifications, dedupes by provider event, requires the provider/order/classification/ledger witness set, compares amount/currency/product/prospect/lead content, and refuses contradicted or unwitnessed money.

### Delivery and acceptance truth

`src/service-fulfillment.mjs` is currently `uberbond.service-fulfillment.v1.4`. Its state machine includes `PLANNED`, `IN_PROGRESS`, QA, delivery, `ACCEPTANCE_PENDING`, `ACCEPTED/REJECTED/REVISION_REQUESTED`, support, renewal, renewed, churned and cancelled states.

Critical sovereignty boundaries already present:

- `CUSTOMER_ACCEPTED`, `CUSTOMER_REJECTED`, revision and churn require `EXTERNAL_CUSTOMER` evidence;
- renewal confirmation requires `EXTERNAL_PAYMENT` evidence;
- fulfillment itself explicitly reports cleared revenue as `NOT_INFERRED`;
- secret-like customer requirements/criteria/event refs fail closed;
- event identity is durable/idempotent and conflicts fail closed;
- future/time-regressing evidence is rejected.

## Architecture falsification — P0/P1 attack result

The live issue and source reconciliation on 2026-08-28 found **no remaining open locally-solvable P0/P1 tracker** on current `main`. The earlier recovery/sovereignty/payment defects have current-main hostile tests and source repairs. The only narrow engineering/canon tracker still open during this pass is P2 #133 for canonical runtime-measurement freshness/reconciliation.

That does **not** mean the entire system is empirically autonomous. These boundaries remain unproven externally:

- real PostgreSQL exact-head gate in the currently available hosted runner;
- real provider/model execution with an authorised credential/spend cap;
- live scheduler duration with device off;
- real customer acceptance;
- real first payment, retained payment and renewal;
- real human escalation delivery;
- country-specific professional tax/legal clearance for the exact operating setup.

The correct architecture verdict is therefore:

`LOCAL_P0_P1_IMPLEMENTATION_CLOSED__EXTERNAL_AND_WHOLE_TREE_RUNTIME_PROOF_REQUIRED`

## Source register — accessed 2026-08-28

Lemon Squeezy:
- Merchant of Record: https://docs.lemonsqueezy.com/help/payments/merchant-of-record
- Payments: https://docs.lemonsqueezy.com/help/payments
- Signed webhook requests: https://docs.lemonsqueezy.com/help/webhooks/signing-requests
- Webhook developer guide/retry semantics: https://docs.lemonsqueezy.com/guides/developer-guide/webhooks
- Order object/status: https://docs.lemonsqueezy.com/api/orders/the-order-object
- Refund/chargeback policy: https://docs.lemonsqueezy.com/help/payments/refunds-chargebacks
- Order refund API: https://docs.lemonsqueezy.com/api/orders/issue-refund

Egyptian Tax Authority:
- ETA e-commerce/freelance treatment FAQ: https://www.eta.gov.eg/ar/node/1376
- ETA current FAQ (e-invoice/e-receipt/VAT): https://eta.gov.eg/ar/alasylt-alshayt
- ETA e-commerce platform: https://eta.gov.eg/en/ecomSDK
- ETA digital/remote-services VAT guidance: https://eta.gov.eg/en/digital-services

## Terminal truth

`ISSUE_79_LOCAL_TRUTH_CHAIN_COMPLETE__REAL_PAYMENT_ACCEPTANCE_RENEWAL_AND_PROFESSIONAL_CLEARANCE_EXTERNAL`

This document defines what counts. It performs no checkout, payment mutation, KYC, customer contact or tax filing.