# Deploy Cash Engine Lite (iPad-friendly, no laptop needed)

Everything below can be done from Safari on an iPad. Total cost: $0.

## What you're setting up

A free website audit tool at your own `.vercel.app` address. Visitors get a free
automated report; you get their contact info as a lead. No Stripe, no monthly bill.

## Step 1 — Get the code onto GitHub

1. Go to github.com and sign in (or create a free account).
2. Create a new repository (or use the one this project already lives in).
3. Upload/push this entire project to it, unchanged. If it's already on GitHub, skip this.

## Step 2 — Create the free database (Neon)

1. Go to neon.tech → sign up free → **Create a project**.
2. Any project name, any region close to your visitors.
3. Once created, go to **Connection Details**. Switch the toggle to **Pooled connection**.
4. Copy that connection string (starts with `postgres://...`). This is your `DATABASE_URL` — save it somewhere private (Notes app is fine temporarily).

## Step 3 — Deploy to Vercel

1. Go to vercel.com → sign up free with your GitHub account.
2. **Add New → Project** → import the GitHub repo from Step 1.
3. Before deploying, expand **Build and Output Settings**:
   - **Root Directory** → set to `lite`
   - **Output Directory** → set to `public`
   - **Build Command** → leave empty / override off
4. Expand **Environment Variables** and add:
   - `DATABASE_URL` → paste the pooled connection string from Step 2
   - `LITE_HASH_SALT` → a private random value of at least 32 characters
   - (optional) `OWNER_EMAIL` → your email
   - (optional) `RESEND_API_KEY` → see Step 5
5. Tap **Deploy**. Wait for the checkmark. You'll get a URL like `your-project.vercel.app` — open it and confirm the audit form loads.

## Step 4 — Turn on the audit worker (GitHub Actions)

The audit itself runs on GitHub's free servers on a schedule, not on Vercel.

1. On GitHub, open your repo → **Settings → Secrets and variables → Actions**.
2. Tap **New repository secret** and add:
   - `LITE_DATABASE_URL` → same pooled connection string from Step 2
   - (optional) `LITE_RESEND_API_KEY`, `LITE_OWNER_EMAIL` → same values as Step 3 if you set them
3. Go to the **Actions** tab → you should see **Cash Engine Lite Audits** listed. If GitHub asks you to enable Actions, tap enable.
4. Tap into that workflow → **Run workflow** (manual trigger) once, to confirm it works before waiting for the schedule.
5. Open the run after it finishes → check the log shows something like `run complete — 0 done, 0 failed` (0 is correct if the queue was empty).

From here it runs automatically every 30 minutes on its own.

## Step 5 — (Optional) Turn on lead emails

Skip this at launch if you want — leads are never lost; they are saved in the
database. Actions logs show only the lead ID and domain, never the person's email,
name, or message. Open the `lite_leads` table in Neon's console to read a lead when
email delivery is not configured.

1. Go to resend.com → sign up free → **API Keys → Create API Key**.
2. Copy the key.
3. Add it as `RESEND_API_KEY` in Vercel (Step 3) **and** `LITE_RESEND_API_KEY` in GitHub (Step 4). Redeploy on Vercel after adding it (Vercel → Deployments → ⋯ → Redeploy).

## Step 6 — Test the full flow

1. Open your `.vercel.app` site → submit your own website + email.
2. You'll immediately get a private report link — save it.
3. Wait up to 30 minutes (or manually run the workflow again from Step 4.4) → refresh the report link → it should show a score and findings.
4. Tap "Request implementation" on the report → submit a test lead → confirm it either arrives by email or appears in Neon's `lite_leads` table. The next Actions log will show only its non-sensitive lead ID and domain.

## Owner actions still required after this guide

- Sign up for Neon (free) — 2 minutes.
- Import + configure the project on Vercel (free) — 5 minutes.
- Add the GitHub secrets and run the workflow once — 3 minutes.
- Optional: sign up for Resend if you want email notifications instead of checking logs.
- Handle payment for implementation work manually — this system has no payment processing by design. When a lead comes in, you invoice them yourself (bank transfer, PayPal, whatever you already use).

## Safety

Never paste `DATABASE_URL` or any API key into chat, a public GitHub file, or a
screenshot. Paste it only into Vercel's or GitHub's own secret/environment
variable screens — exactly as shown above.
