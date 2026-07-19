# iPad operator guide

The owner cockpit is the authenticated `/admin.html` view. It is designed for Safari on iPad and opens on **What needs you now**, not the full operations console.

## Safety state

- Opening the cockpit does not start a worker or send email.
- Approving a draft records an owner decision only. It does not schedule or send the message.
- Every approval rechecks the campaign, public contact evidence, website evidence, draft quality, stored subject/body match, suppression list, and terminal prospect state.
- Live outbound remains controlled separately by system, campaign, inbox, dry-run, business-hour, capacity, unsubscribe, and send-safety gates.
- The global kill switch takes precedence over campaign and inbox controls.

Keep the admin token in the password field and tap **Save token**. It is stored in Safari local storage and sent only as a Bearer authorization header for API calls and downloads; query-string admin tokens are rejected. Safe cockpit exports do not put the token in a download URL. Never share a screenshot containing the token field or leave an unlocked iPad unattended.

## Default attention view

The first screen contains only five queues:

1. **Problems** — audit failures, bounces, complaints, ambiguous provider results, terminal processing failures, and payment exceptions.
2. **Drafts** — quality-approved, evidence-bound drafts awaiting an owner decision.
3. **Positive** — interested or otherwise positive replies that need an owner response.
4. **Payments** — paid, checkout, refund, dispute, cancellation, or failed-payment events when present.
5. **Tasks** — queued or completed delivery records.

The lifecycle strip below these queues shows counts for all supported acquisition states without expanding the full operations view.

## Reviewing a draft

1. Tap **Edit / evidence**.
2. Inspect the primary issue, exact excerpt, affected URL, screenshots, confidence, score logic, contact provenance, risk flags, and sentence bindings.
3. Edit the subject or message only when needed. A save is rejected if it changes an approved fact or adds unsupported language.
4. Return to the attention view and tap **Approve** or **Reject**.

Approval never overrides a failed gate. A blocked approval remains in review with a reason. Rejection clears follow-up timing. Repeating an approval is idempotent and does not create a second action.

For a batch, select only drafts already inspected and tap **Approve selected safe drafts**. The server rechecks each item independently, caps a batch at 50, approves safe items, and reports skipped items. A batch decision still cannot send email.

## Filters and exports

Filter by campaign, country, niche, minimum score, lifecycle status, and date range, then tap **Apply**. Filters affect the attention queues, lifecycle counts, and safe export.

The cockpit CSV and JSON exports include business identity, public website, location, niche, score, lifecycle, issue title/service, evidence presence, contact mode, draft-quality score, approval state, reply classification, payment state, delivery state, and update time. They intentionally omit contact emails, message bodies, reply bodies, OAuth data, report tokens, payment-provider references, and credentials.

## Pause controls

- **Kill outbound** closes the global outbound switch immediately while allowing research and reporting to continue.
- **Resume safely** only reopens that global switch. It does not bypass dry-run or any remaining safety gate.
- **Pause campaign** stops the selected campaign. The cockpit can resume only a non-live, dry-run campaign that was explicitly paused there. A configuration-disabled campaign—including the demonstration campaign—cannot be activated from the cockpit; live-capable activation uses a separate privileged path.
- **Inbox A/B pause** stops one sender independently. Resume it only after resolving bounce, complaint, authentication, or provider-health problems.

If anything looks inconsistent, activate the global kill switch first, preserve the displayed error, and investigate from **Open operations**. Do not remove suppressions or retry an ambiguous send merely to clear a warning.

## Full operations view

Tap **Open operations** for discovery, imports, queue details, complete prospect tables, inbound audits, revenue records, and optional Gmail connection controls. Tap **Back to attention** to return to the concise owner queue. The working Cash Engine Lite deployment is separate and must not be changed or redeployed from this console.

## Operational meaning

A visible state means the stored record reached that state; it does not by itself prove a live provider integration. In particular, approved drafts are ready for later controlled scheduling, not sent. Payment is operational only when backed by a verified provider webhook or explicit manual owner confirmation, and delivery is operational only when its task record and proof exist.

## First safe operator check

Before authenticating Gmail or a payment provider, run `npm run acceptance` in the repository. The expected output ends with `ACCEPTANCE PASSED` and reports:

- 19 explicit transitions through `delivery-queued`;
- one simulated Gmail message and zero real emails;
- one deterministic reply classification and a cancelled follow-up;
- one HMAC-verified payment webhook in provider test mode;
- one paid test order and one delivery task;
- zero external network calls and zero customer-site modifications.

This proves the local test path, not the acquisition deployment or live providers. Use `docs/DEPLOYMENT_MATRIX.md` for current status and `docs/OWNER_AUTHENTICATION_CHECKLIST.md` for the remaining owner-only steps.
