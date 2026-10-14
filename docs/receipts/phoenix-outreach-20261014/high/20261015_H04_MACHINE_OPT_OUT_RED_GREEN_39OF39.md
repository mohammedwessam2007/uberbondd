# PHOENIX H04 red-to-green machine opt-out guard

WE HAVE DONE: independently proved unlinked Auto-Submitted email incorrectly created a suppression. Test-first run 38652107216 FAILED 1/1, 1 suppressions versus expected 0. Corrected only the unlinked automatic suppression guard, preserving human unsubscribe route, and regenerated official readiness and constitution.

VERIFIED: Repair run 38652204476 SUCCESS. Hosted inbound 39/39, freshness 8/8. Source commit 276f321a (full parent of generated c89fc78a5c1bad1bb36d421ec47e02ed6767f8eb). Source blob 8d7aaadbbaf6b330a93dc9be58afe5a5f38a5052 read back, test blob 0dd2a8a6f771c8111ec9e5924bc3937b9a0405b0 read back. Draft PR #1430 stacked on integrated H01+H09 review-only branch.

WHAT IS LEFT: exact new-head broad CI, independent code review, production database continuity and actual provider/recipient permissions.

NEXT: inspect PR #1430 hosted checks, only merge if reviewed and safe.

SAFETY: no actual email, charges, DNS, secret access or production writes.
