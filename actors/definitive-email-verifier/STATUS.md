# Status: KILLED on Apify (2026-11-15)

Not published. Do not publish as is.

- Live test on Apify, run `N3Ecbz9sH4yRYvJCV`: build succeeded, run succeeded, and every address came back `SMTP_UNAVAILABLE` because Apify blocks outbound port 25. Receipt: `artifacts/monetization-singularity/apify-live-test-2026-11-15.json`.
- This met the kill condition set before the test.
- The selling point was not new either: `pnda/email-verifier` already charges only for valid and invalid results.
- Full-store measurement: at most 2.7% of new email-verifier listings reach 50 monthly users (381 competitors). Receipt: `artifacts/monetization-singularity/apify-niche-full-search-2026-11-15.json`.

What still works and can be reused: syntax and duplicate handling, two-witness DNS, disposable and role flags, deliver-before-charge billing (`src/`).

Revival would need a host where outbound port 25 is open plus clean IP reputation (money, founder decision), and it would still face 381 competitors. Not recommended.
