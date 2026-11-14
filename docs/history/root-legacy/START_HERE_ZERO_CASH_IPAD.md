# Start Here: Cash Engine Lite on iPad for Zero Cash

> Verified against this repository on 2026-07-15.  
> Target: Vercel public site and serverless APIs + Neon PostgreSQL + GitHub Actions browser-audit worker.  
> Cost target: free tiers only. Provider limits and terms can change.  
> Important: this guide deploys only the isolated `lite/` application. It does not activate the full outbound engine.

## Before you tap anything

You need:

- a GitHub account with this **complete repository** in a private repository;
- a Neon account;
- a Vercel account connected to GitHub;
- Safari on the iPad;
- a password manager or another safe place to hold secrets temporarily.

Never paste a database URL, API key, or salt into chat, a GitHub file, an issue, an Actions log, or a screenshot.

## 1. Create the Neon database

1. In Safari, open [console.neon.tech](https://console.neon.tech/).
2. Tap **Sign up** or **Log in**.
3. Tap **New Project** or **Create Project**.
4. For the project name, enter `uberbond-lite`.
5. Choose a region close to the people who will use the site.
6. Keep the default PostgreSQL version, database, and role unless Neon requires a selection.
7. Tap **Create Project**.
8. Wait for the project dashboard to open.

## 2. Copy the pooled `DATABASE_URL`

1. In the Neon project dashboard, tap **Connect**.
2. In **Connection Details**, select the main branch, default database, and default role.
3. Turn **Connection pooling** or **Pooled connection** on.
4. Confirm the hostname displayed in the connection string contains `-pooler`.
5. Tap **Copy** beside the connection string.
6. Save it temporarily in your password manager under `UberBond Lite DATABASE_URL`.
7. Do not edit the URL. It should begin with `postgresql://` or `postgres://` and normally end with SSL parameters.

Neon's official connection instructions are at [Connecting Neon to your stack](https://neon.com/docs/get-started/connect-neon).

## 3. Run the Lite migration in Neon

The APIs can create the same idempotent schema on first use, but run the migration explicitly so setup errors appear before launch.

1. In another Safari tab, open your GitHub repository.
2. Tap **Code**, then open `lite` → `migrations` → `lite_001.sql`.
3. Tap **Raw**. Long-press the SQL, tap **Select All**, then tap **Copy**.
4. Return to the Neon tab.
5. In the Neon sidebar, tap **SQL Editor**.
6. Tap **New Query**.
7. Paste the complete contents of `lite_001.sql`.
8. Tap **Run**.
9. Wait for a successful completion message. The statements are idempotent, so running them again does not duplicate tables.
10. In Neon, open **Tables** and confirm these tables exist:
    - `lite_audit_requests`
    - `lite_reports`
    - `lite_leads`
11. Open `lite_audit_requests` and confirm it includes `processing_stage`.
12. Open `lite_leads` and confirm it includes `selected_issue_code`, `service_interest`, `status`, `source_page`, and `dedupe_key`.

Stop here if the SQL reports an error. Do not deploy against a partially created schema.

## 4. Generate the private hash salt

1. Open your password manager.
2. Create a generated password with at least 32 random characters; 48 or 64 is better.
3. Save it as `UberBond Lite LITE_HASH_SALT`.
4. Do not reuse your Neon password or database URL.

This value prevents stored visitor-IP hashes from using the public compatibility fallback.

## 5. Import the repository into Vercel

1. Open [vercel.com](https://vercel.com/) and log in with GitHub.
2. From the dashboard, tap **Add New…**.
3. Tap **Project**.
4. Find the private GitHub repository containing this complete application.
5. Tap **Import** beside that repository.
6. On **Configure Project**, set **Framework Preset** to **Other**.
7. Find **Root Directory** and tap **Edit**.
8. Select or type exactly `lite`—lowercase, with no leading slash and no trailing slash.
9. Confirm the displayed root directory is `lite`, then tap **Continue** or **Save**.
10. Under **Build and Output Settings**:
    - leave **Build Command** empty;
    - set **Output Directory** to `public` if Vercel has not selected it automatically;
    - leave **Install Command** on its default so Vercel uses `lite/package-lock.json`.

The correct Vercel root is **`lite`**, not the repository root. Vercel documents Root Directory and the automatic `public` output for the **Other** preset in [Configuring a Build](https://vercel.com/docs/builds/configure-a-build).

## 6. Add Vercel environment variables

Still on Vercel's **Configure Project** screen:

1. Expand **Environment Variables**.
2. Add `DATABASE_URL`:
   - tap the name field and enter `DATABASE_URL`;
   - paste the pooled Neon URL into the value field;
   - select **Production**;
   - tap **Add**.
3. Add `LITE_HASH_SALT`:
   - enter `LITE_HASH_SALT` as the name;
   - paste the random value created in Step 4;
   - select **Production**;
   - tap **Add**.
4. To receive owner emails immediately, also add:
   - `OWNER_EMAIL` = your receiving email address;
   - `RESEND_API_KEY` = your Resend API key;
   - optionally `LITE_EMAIL_FROM` = a sender authorized by your Resend account.
5. If you are not configuring Resend today, omit those three variables. Leads still remain stored in Neon.
6. Tap **Deploy**.
7. Wait for Vercel to show **Ready** and a `.vercel.app` URL.

Do not mark launch complete yet.

## 7. Check the deployed API and site

1. Open the Vercel deployment URL.
2. Confirm the UberBond free audit page loads.
3. Add `/api/health` to the end of the deployment URL and open it.
4. Continue only if the response contains:

```text
"ok":true
"databaseConfigured":true
"databaseReachable":true
```

5. If the health endpoint returns status 503 or says setup is incomplete:
   - open Vercel → your project → **Settings** → **Environment Variables**;
   - correct `DATABASE_URL`;
   - open **Deployments**;
   - tap the latest deployment's menu;
   - tap **Redeploy**;
   - check `/api/health` again.

## 8. Add GitHub Actions secrets

1. Open the GitHub repository.
2. Tap **Settings**. If it is hidden, swipe the repository tab row sideways or open the menu.
3. In the left sidebar, tap **Secrets and variables**.
4. Tap **Actions**.
5. Under **Repository secrets**, tap **New repository secret**.
6. Enter `LITE_DATABASE_URL` as the name.
7. Paste the same pooled Neon URL as the value.
8. Tap **Add secret**.
9. If owner email is configured, create two more repository secrets:
   - `LITE_RESEND_API_KEY` = the same Resend API key;
   - `LITE_OWNER_EMAIL` = your owner email address.
10. Do not put these values under repository **Variables**; use encrypted **Secrets**.

GitHub's current instructions are [Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

## 9. Run the worker once with an empty queue

1. In the GitHub repository, tap **Actions**.
2. If GitHub displays **Enable Actions**, tap it.
3. In the workflow list, tap **Cash Engine Lite Audits**.
4. Tap **Run workflow**.
5. Keep the branch set to the default branch containing this package.
6. Tap the green **Run workflow** button in the menu.
7. Refresh the page until a new run appears.
8. Open the run and wait for every step to turn green.
9. Open **Process queued audits and pending leads**.
10. With no queued audit, the final line should report `0 done, 0 failed this run`.

The workflow installs Chromium once within that GitHub-hosted run. Do not install Chromium on Vercel. GitHub's manual-run instructions are at [Manually running a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

## 10. Trigger the first real audit

Use a public website you own or are authorized to test.

1. Return to the `.vercel.app` home page.
2. In **Your website**, enter the public website domain.
3. In **Your email**, enter your own email address.
4. Tap **Run my free audit** once.
5. Wait for **Your audit is queued**.
6. Tap **Copy link** and save the private report link in your password manager or Notes.
7. Do not share that link: the random token inside it is the key to the report.
8. Open the report link and leave it open. It polls automatically and shows only stages recorded by the worker; it does not use a simulated percentage.

## 11. Process the queued audit immediately

1. Return to GitHub → repository → **Actions**.
2. Open **Cash Engine Lite Audits**.
3. Tap **Run workflow** → green **Run workflow** again.
4. Open the new run.
5. Wait for **Process queued audits and pending leads** to finish.
6. Confirm the log ends with `1 done, 0 failed this run` for the submitted domain.
7. If it says the audit failed, leave the row and error intact; do not repeatedly rerun. Check whether the target blocks automated browsers or is temporarily unavailable.

### If the run still says `0 done, 0 failed`

That line means the worker found no claimable request in the database it opened. The private report link alone does not prove that Vercel and GitHub opened the same database.

1. In Vercel, open the latest **Production** deployment → **Logs** and find the line beginning `[lite] queue diagnostic source=vercel-submit` for your test submission.
2. In GitHub, open the same worker run → **Process queued audits and pending leads** and find `[lite] queue diagnostic source=github-worker-start`.
3. Compare only the short value after `db=`. Never copy or screenshot either full connection string.
4. If the two `db=` values differ, open Vercel → **Settings** → **Environment Variables** and confirm the pooled Neon URL is named `DATABASE_URL` for **Production**. Then open **Deployments** and redeploy. Vercel environment-variable changes do not update deployments that already exist.
5. Confirm the public `.vercel.app` production alias now points to that new deployment. Do not test an older deployment URL or a Preview deployment.
6. In GitHub → **Settings** → **Secrets and variables** → **Actions**, replace `LITE_DATABASE_URL` with the same pooled Neon URL if its endpoint is wrong. Do not print the secret to compare it.
7. Submit one fresh authorized test site after the production redeploy, run the workflow once, and compare the new lines:
   - Vercel should show `inserted=true` and at least one `queued` row.
   - GitHub worker start should show the same `db=` value and the queued row.
   - GitHub worker end should show the row moved out of `queued`, and the run should finish `1 done, 0 failed this run`.

The diagnostic contains only a one-way database fingerprint, aggregate `queued`/`running`/`done` counts, and an insertion flag. It never prints the database URL, password, report token, domain, email, requester hash, or stored error.

## 12. Open the secure report

1. Open the private `/r/...` link saved in Step 10.
2. The page should update automatically from waiting, active processing, and report-preparation states. A manual refresh is safe but normally unnecessary.
3. Confirm the page shows the submitted domain, score, grade, evidence-backed findings, and up to three ranked priorities.
4. If **Quick Wins** appears, confirm every listed item also exists as an evidence-backed finding. The section is intentionally omitted when no finding meets its threshold.
5. Confirm the URL still begins with your own Vercel origin and `/r/`.
6. Do not copy the token into support messages, screenshots, analytics, or public notes.

The report response is configured as private/no-store/noindex with a no-referrer policy. Only the SHA-256 hash of the generated 256-bit token is stored in PostgreSQL.

## 13. Test the implementation-request button

1. Scroll to **Want these fixed—properly?**
2. Under **What should we help with?**, select one listed finding or keep **General implementation review**.
3. Enter your name.
4. Enter an email address you control.
5. In the message, enter `Launch verification test — please ignore.`
6. Tap **Request implementation** once.
7. Confirm the page displays **Request received** and says the request is stored.
8. Do not tap again. If a network retry does repeat the same request, the database deduplicates it.

If Resend is configured:

1. Open the owner inbox.
2. Confirm an email titled **New implementation lead — [domain]** arrives.

If Resend is not configured:

1. Open Neon → your project → **SQL Editor**.
2. Run:

```sql
SELECT id, email, name, message, selected_issue_code, service_interest,
       status, source_page, owner_notified, created_at
FROM lite_leads
ORDER BY created_at DESC
LIMIT 5;
```

3. Confirm the test request appears.
4. Confirm `status` is `new`, `source_page` is `private_report`, and the selected issue/service matches the form.
5. GitHub Actions logs will show only the lead ID and domain, not its email, name, or message.

## 14. Final launch check

Do not call the system launched until all are true:

- [ ] Vercel deployment state is **Ready**.
- [ ] `/api/health` returns database configured and reachable.
- [ ] Neon contains the three `lite_*` tables.
- [ ] GitHub's **Cash Engine Lite Audits** run is green.
- [ ] One authorized real website audit completed.
- [ ] Its private report opened with typed evidence and no unsupported finding.
- [ ] Ranked priorities contain no duplicates; fewer than three is acceptable.
- [ ] The implementation request was stored once in `lite_leads` with issue/service, `new` status, and `private_report` source.
- [ ] Owner notification arrived, or the owner can read the lead securely in Neon.

The automatic schedule runs every 30 minutes, but GitHub may delay scheduled jobs. Manual **Run workflow** remains the fastest launch check.
