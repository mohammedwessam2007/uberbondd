# Lemon Squeezy Payment Setup

The application includes a Lemon Squeezy hosted-checkout and webhook adapter.

## Products to create

1. **Full Digital Audit**: one-time payment
2. **Strategy Audit**: one-time payment
3. **UberBond Watch**: monthly subscription

Copy each hosted checkout URL into Railway environment variables:

```env
FULL_AUDIT_CHECKOUT_URL=https://YOUR-STORE.lemonsqueezy.com/checkout/buy/VARIANT
STRATEGY_AUDIT_CHECKOUT_URL=https://YOUR-STORE.lemonsqueezy.com/checkout/buy/VARIANT
MONITORING_CHECKOUT_URL=https://YOUR-STORE.lemonsqueezy.com/checkout/buy/VARIANT
```

The server adds these custom fields automatically:

- `lead_id`
- `prospect_id`
- `product`

It does not place the customer's email address in custom URL data.

## Webhook

Create a webhook with this URL:

```text
https://YOUR-DOMAIN/webhooks/lemonsqueezy
```

Subscribe to order and subscription lifecycle events.

Set the same signing secret in Railway:

```env
LEMONSQUEEZY_WEBHOOK_SECRET=YOUR-RANDOM-SECRET
```

The server calculates an HMAC-SHA256 digest from the raw request body and compares it with the `X-Signature` header using a timing-safe comparison.

## Test mode

Use Lemon Squeezy test mode before accepting real money.

For local internal testing only, you may set:

```env
ALLOW_TEST_PAYMENT_UNLOCK=true
```

Then the protected admin endpoint can simulate an unlock. Never leave this enabled on a public production deployment.

## What happens after payment

- An order is recorded.
- The lead receives paid access.
- The full report unlocks immediately.
- Revenue appears in the admin dashboard.
- A monitoring purchase creates or updates a subscription.
- The subscription schedules the next website re-audit.
