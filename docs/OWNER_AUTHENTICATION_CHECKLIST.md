# Owner authentication checklist

Complete only the section for the capability you intend to activate. Keep outbound disabled and dry-run enabled throughout setup. Never paste a credential into a campaign file, issue, commit, build log, screenshot, or chat.

## 1. Preserve the working Lite service

- [ ] Confirm the relevant Vercel project is exactly `uberbondd-lite-private`.
- [ ] Do not link, redeploy, rename, replace, or merge acquisition code into that project.
- [ ] Do not use the obsolete Vercel project named `uberbondd`.
- [ ] Leave `.github/workflows/lite-audits.yml` and existing Lite secrets unchanged unless a separately authorized Lite repair requires them.

## 2. Publish the local milestone commits

Current publication is blocked because this environment has no authenticated Git credential and the connected GitHub app lacks repository Contents write access.

- [ ] Grant the GitHub app Contents write permission for `mohammedwessam2007/uberbondd`, or authenticate GitHub CLI with write access.
- [ ] Verify the target repository and branch before pushing: `mohammedwessam2007/uberbondd`, `main`.
- [ ] Confirm the remote still points to the expected base before publication.
- [ ] Push only the milestone commits; do not commit `docs/night-shift/patches/` unless intentionally publishing recovery artifacts.
- [ ] Record the actual remote SHA in `docs/night-shift/NIGHT_SHIFT_STATE.md` after a successful push.

If authentication remains unavailable, recover from the format patches in `docs/night-shift/patches/` or the path-preserving ZIP for each milestone.

## 3. Acquisition Web and Worker

Use a new acquisition deployment, not the Lite Vercel project.

- [ ] Provision one PostgreSQL database for acquisition data.
- [ ] Set `NODE_ENV=production`, `STORE_BACKEND=postgres`, and the same `DATABASE_URL`, `APP_BASE_URL`, encryption key, and unsubscribe secret on Web and Worker.
- [ ] Set Web `PROCESS_ROLE=web` and Worker `PROCESS_ROLE=worker`; production rejects combined mode.
- [ ] Generate a random admin token of at least 32 characters.
- [ ] Generate a 64-hex-character token-encryption key.
- [ ] Generate an independent unsubscribe secret of at least 32 characters.
- [ ] Keep `OUTBOUND_PROVIDER=test`, `OUTBOUND_ENABLED=false`, `OUTBOUND_DRY_RUN=true`, and `OUTBOUND_LIVE_SEND_APPROVED=false`.
- [ ] Run migrations, health checks, the acceptance command, and deterministic tests before connecting providers.

## 4. GitHub Actions acquisition workers

These names are referenced by `.github/workflows/acquisition-workers.yml`:

- [ ] Secret `ACQUISITION_DATABASE_URL`.
- [ ] Secret `ACQUISITION_TOKEN_ENCRYPTION_KEY`.
- [ ] Secret `ACQUISITION_UNSUBSCRIBE_SECRET`.
- [ ] Variable `ACQUISITION_APP_BASE_URL` using HTTPS.
- [ ] Leave Gmail secrets unset until the dedicated Gmail step below.
- [ ] Run `workflow_dispatch` with `deterministic-tests`, then `discovery` on a bounded campaign.
- [ ] Inspect privacy-safe artifacts and database state. The Actions workflow contains no real-send worker.

## 5. Gmail OAuth — currently blocked

- [ ] Configure a Google Cloud OAuth application owned by the business.
- [ ] Set an HTTPS callback matching `GOOGLE_REDIRECT_URI` exactly.
- [ ] Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only to the acquisition deployment secret store.
- [ ] Set a valid sender name, company, and postal business address.
- [ ] Configure SPF, DKIM, and DMARC for the sender domain.
- [ ] Connect each inbox from the authenticated owner cockpit and verify the returned mailbox identity.
- [ ] Test reply threading, unsubscribe, one-click unsubscribe, a controlled bounce, and complaint/pause handling with owner-controlled test mailboxes.
- [ ] Keep live sending off after OAuth succeeds. OAuth authentication alone is not live-send approval.

Only after a separate legal/jurisdiction review and tiny observed pilot may the owner deliberately set the Gmail provider and live gates. The recommended initial ceiling is 10–20 messages per inbox per day; the system must never raise caps automatically from small samples.

## 6. Payment provider — currently blocked

- [ ] Create or select the owner’s Lemon Squeezy store and products in provider test mode.
- [ ] Configure hosted checkout URLs for only the approved offers.
- [ ] Generate the webhook signing secret and store it as `LEMONSQUEEZY_WEBHOOK_SECRET`.
- [ ] Point the provider webhook to the acquisition Web service, not Lite.
- [ ] Complete a provider test-mode checkout and confirm one signed event creates one idempotent paid order and one delivery task.
- [ ] Confirm invalid signatures, amount/currency mismatches, redirects, screenshots, emails, and frontend requests cannot mark paid.
- [ ] Do not switch provider mode to live until the owner verifies tax, refund, dispute, currency, product, and fulfillment settings.

Manual payment remains owner-confirmed and requires an exact amount, currency, and confirmation reference. It is not inferred from an email or screenshot.

## 7. Optional providers

- [ ] Hunter: add `HUNTER_API_KEY` only if first-party website contacts are insufficient. Never enable guessed-email automation.
- [ ] AI: add one supported provider key only after rules-only output is accepted. AI remains subordinate to stored evidence and quality gates.
- [ ] Object storage: add only when PostgreSQL artifact volume justifies it; it is not required for the initial test path.

## Final owner sign-off

- [ ] Global kill switch tested.
- [ ] Campaign and inbox pause tested.
- [ ] Suppression cannot be bypassed by retry or campaign reassignment.
- [ ] One follow-up maximum confirmed.
- [ ] Positive and uncertain replies route to owner review; no automated negotiation occurs.
- [ ] No claim of guaranteed revenue, rankings, conversion, patients, or legal compliance appears in campaign copy.
- [ ] `docs/DEPLOYMENT_MATRIX.md` accurately reflects which integrations were actually demonstrated.
