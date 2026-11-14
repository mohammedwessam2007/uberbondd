# Claude Independent Review Mission

Review the attached `UberBond_Revenue_Engine_v1.1_Mission1.zip` as an independent senior engineer.

Do not redesign or rewrite the application. Inspect the automatic OpenStreetMap Overpass discovery implementation added in version 1.1.

Verify:

1. Bounding-box and category input cannot inject arbitrary Overpass QL.
2. Only public website-bearing records can enter the prospect queue.
3. Domain deduplication works globally.
4. Dry-run mode imports nothing.
5. Daily caps cannot be bypassed by repeated scheduled runs.
6. Discovery cannot run under an invalid or unapproved campaign.
7. Scheduled discovery does not silently enable email sending.
8. Source attribution and record IDs are retained.
9. API and dashboard errors are understandable on an iPad.
10. Existing audit, payment, monitoring, Gmail, and reply behavior has not regressed.

Run clean install, check, all tests, `npm run smoke`, `npm run smoke:discovery`, and `npm run visual`.

Patch only confirmed defects. Return:

- a corrected ZIP,
- exact files changed,
- test output,
- remaining risks,
- and a concise verdict: PASS, PASS WITH FIXES, or FAIL.

Do not claim live Overpass verification unless you actually execute a real preview request against the configured public endpoint.
