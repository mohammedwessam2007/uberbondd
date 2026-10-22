# UberBond Website Inquiry Audit \| Historical Sample Only

**Evidence class:** HISTORICAL\_PUBLIC\_SITE\_REHEARSAL\_NOT\_LIVE\_VALIDATED\_NOT\_PAYMENT\_EVIDENCE
**Approved website:** Multiple historical test sites \(sample of format, not customer scope\)
**Scan timestamp:** 2026-10-22 historical record; precise run-start timestamp UNKNOWN
**Pages examined:** 0 recorded

## Scope and restrictions
Read-only checks of up to ten publicly accessible pages of the approved website. No phone calls, form submissions, authentication, security exploitation, or access to private infrastructure. Customer must be authorized to commission checks.

## Verified findings

### 1. A call button labelled \(512\) 975-3085 dials \(512\) 262-4837
- Website: https://www.reliantplumbing.com/
- Defect class: TEL\_LABEL\_DIALS\_DIFFERENT\_NUMBER
- Discovered: UNKNOWN
- Re-verified: 2026-10-22T04:34:29.573Z
- Business/financial impact: UNKNOWN
- Reproduce or disprove: On a phone, open https://reliantplumbing.com/ and tap the "512-975-3085" control. If the dialer shows \(512\) 975-3085, this finding is wrong.
- Source: https://reliantplumbing.com/ | HTML: `\<a href="tel:5122624837"\> 512-975-3085` | Source SHA-256: 9faf3c152dce20b4e2e7530305e42d15a3f02100e95c70822737439cfadf23cc
- Source: https://reliantplumbing.com/ | HTML: `\<a href="tel:5122624837"\> 512-975-3085` | Source SHA-256: dd2f682560da10cc9577ecf83e80d4ff6648541c934f12bd38352efa6860bf96
- Source: https://reliantplumbing.com/contact-us/ | HTML: `\<a href="tel:5122624837"\> 512-975-3085` | Source SHA-256: dfcf1a768e0348e135aa69bc81f75386f62e5185e07ae3bbaeb078cc916f6fc4
- Source: https://reliantplumbing.com/discounts/ | HTML: `\<a href="tel:5122624837"\> 512-975-3085` | Source SHA-256: 09a0328f155d010a4028ac961c645292f06fbc59be84dc7e410120c5e354640d
- Source: https://reliantplumbing.com/plumbing/emergency-plumbing/ | HTML: `\<a href="tel:5122624837"\> 512-975-3085` | Source SHA-256: d0667cff1a94ed5a7cf9318b4c83af0dccd83a9ab93374f302ee3464bbfb87a4

### 2. A call button labelled \(512\) 305-1070 dials \(512\) 305-0070 \(one digit different\)
- Website: https://www.reliantplumbing.com/
- Defect class: TEL\_LABEL\_DIALS\_DIFFERENT\_NUMBER
- Discovered: UNKNOWN
- Re-verified: 2026-10-22T04:34:29.573Z
- Business/financial impact: UNKNOWN
- Reproduce or disprove: On a phone, open https://reliantplumbing.com/ and tap the "\(512\) 305-1070" control. If the dialer shows \(512\) 305-1070, this finding is wrong.
- Source: https://reliantplumbing.com/ | HTML: `\<a href="tel:5123050070"\> \(512\) 305-1070` | Source SHA-256: 9faf3c152dce20b4e2e7530305e42d15a3f02100e95c70822737439cfadf23cc
- Source: https://reliantplumbing.com/ | HTML: `\<a href="tel:5123050070"\> \(512\) 305-1070` | Source SHA-256: dd2f682560da10cc9577ecf83e80d4ff6648541c934f12bd38352efa6860bf96
- Source: https://reliantplumbing.com/contact-us/ | HTML: `\<a href="tel:5123050070"\> \(512\) 305-1070` | Source SHA-256: dfcf1a768e0348e135aa69bc81f75386f62e5185e07ae3bbaeb078cc916f6fc4
- Source: https://reliantplumbing.com/discounts/ | HTML: `\<a href="tel:5123050070"\> \(512\) 305-1070` | Source SHA-256: 09a0328f155d010a4028ac961c645292f06fbc59be84dc7e410120c5e354640d
- Source: https://reliantplumbing.com/plumbing/emergency-plumbing/ | HTML: `\<a href="tel:5123050070"\> \(512\) 305-1070` | Source SHA-256: d0667cff1a94ed5a7cf9318b4c83af0dccd83a9ab93374f302ee3464bbfb87a4

### 3. The structured data declaring this business as HomeAndConstructionBusiness / HVACBusiness / Plumber / Electrician with phone \(602\) 273-7247 is invalid JSON, so machines discard all of it
- Website: https://www.parkerandsons.com/
- Defect class: STRUCTURED\_DATA\_UNPARSEABLE
- Discovered: UNKNOWN
- Re-verified: 2026-10-22T04:34:34.878Z
- Business/financial impact: UNKNOWN
- Reproduce or disprove: Run https://www.parkerandsons.com/ through Google's Rich Results Test or the Schema Markup Validator; if no parse error is reported, this finding is wrong.
- Source: https://www.parkerandsons.com/ | HTML: `Unexpected non-whitespace character after JSON at position 4817 \(line 188 column 1\): \{ "@context": "http://www.schema.org", "@type": \["HomeAndConstructionBusiness","HVACBusiness", "Plumber", "Electrician"\], "@id": "https` | Source SHA-256: 28bd29500d95f7eecb513db944b635c6b6cff9e1e61a748a21bdeebcd8d89891

## Questions requiring human confirmation
- Intentional call tracking or number routing must be confirmed by the website owner before describing a difference as a defect.

## Clean checks
No explicit clean checks supplied.

## Unobservable checks
None supplied. An unobservable check is never a billable defect.

## Billing and financial status
- Run mode / evidence: HISTORICAL\_PUBLIC\_SITE\_REHEARSAL\_NOT\_LIVE\_VALIDATED\_NOT\_PAYMENT\_EVIDENCE
- Platform charge events claimed in input: 3 (not proof of provider settlement)
- Final collected payment: NOT EVIDENCED
- Cleared contribution profit: NOT EVIDENCED
A provider charge event, receipt, or invoice is not proof of cleared funds.

## Delivery acceptance
- Buyer acceptance: NOT REQUESTED: SAMPLE ONLY
Delivery is accepted only by explicit buyer confirmation of the agreed scope. Silence is not acceptance.

## Price, corrections and support
Proposed $99 direct pilot, one site up to ten public pages; only after acceptance of scope.
One factual correction pass included. Disproven finding: remove and refund or do not invoice its agreed share, subject to approved written terms. Support contact must be provided before purchase.

## Commercial limitations and exclusions
No assertion that a mismatch loses customers or revenue. Different telephone destinations may be legitimate routing or call tracking. No conversion analysis, revenue attribution, guarantees of completeness or uninterrupted website availability. Historical demonstration reports are NOT current independently verified findings.

## Reproducibility and provenance
Open each URL in a normal browser, inspect the displayed inquiry control, and compare it with the destination shown by the browser or dialer. A number mismatch alone is not proof of malfunction. Ask the business to confirm its intended routing. If current behavior differs, treat this report as superseded rather than charging for that claim.
