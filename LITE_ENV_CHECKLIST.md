# Cash Engine Lite — Environment Variable Checklist

Two separate places need variables: **Vercel** (runs the public site + API) and
**GitHub** (runs the scheduled audit worker). They are not shared automatically —
set both.

## Vercel → Project → Settings → Environment Variables

| Variable | Required? | Value |
|---|---|---|
| `DATABASE_URL` | **Required** | Neon **pooled** connection string |
| `OWNER_EMAIL` | Optional | Your email — where implementation leads get sent |
| `RESEND_API_KEY` | Optional | From resend.com — needed for lead emails to actually send |
| `LITE_HASH_SALT` | **Required for launch** | Private random value of at least 32 characters — salts hashed visitor IPs |
| `LITE_EMAIL_FROM` | Optional | Sender shown on lead emails (default: `UberBond Lite <onboarding@resend.dev>`) |

Without `OWNER_EMAIL`/`RESEND_API_KEY`, leads are still saved. Actions logs show
only a lead ID and domain; contact details remain in Neon's `lite_leads` table.

## GitHub → Repo → Settings → Secrets and variables → Actions → Secrets

| Secret | Required? | Value |
|---|---|---|
| `LITE_DATABASE_URL` | **Required** | Same Neon pooled connection string as above |
| `LITE_RESEND_API_KEY` | Optional | Same value as Vercel's `RESEND_API_KEY` |
| `LITE_OWNER_EMAIL` | Optional | Same value as Vercel's `OWNER_EMAIL` |
| `LITE_HASH_SALT` | Not used by the worker today | It may be set to the same Vercel value for future compatibility; never expose it |

The `LITE_` prefix on GitHub secrets is deliberate — it avoids colliding with any
secrets the production engine's own workflow may already use in this repo. The
workflow (`.github/workflows/lite-audits.yml`) maps them back to the plain names
(`DATABASE_URL`, etc.) internally.

## Not required anywhere

No Stripe keys, no paid hosting keys, no API keys are ever sent to the browser —
confirm this yourself: view source on the deployed site, nothing sensitive appears.
