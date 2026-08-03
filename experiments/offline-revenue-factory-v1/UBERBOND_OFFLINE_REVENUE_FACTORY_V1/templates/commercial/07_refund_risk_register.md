# Refund-risk register — [LANE]

Known reasons a buyer might dispute the value of a delivery, and how
the evidence trail this system produces mitigates (or does not
mitigate) each one. Review before pricing a new buyer relationship.

| Risk | Likelihood driver | Mitigation already built in | Residual risk (assumption, not observed) |
|---|---|---|---|
| "You didn't actually check anything real" | Buyer expected live scanning/fetching; this system is offline-only | `SYNTHETIC`/`CUSTOMER_PROVIDED` data classification is visible per evidence item; input checklist (`03_input_checklist.md`) sets expectations up front | Medium — set expectations explicitly before the sale, not after |
| "The report didn't tell me anything I didn't know" | Findings are deliberately conservative (blocked conclusions, no guarantees) | Report clearly separates "what was checked" (scope) from "what was concluded" (always human-reviewed) | Medium — this is a structural property of the product, not a bug; price accordingly |
| "You certified something you shouldn't have" | Would indicate a real defect | `claim_safety.rules.scan_text` blocks render on any detected certification/guarantee language; QA gate blocks lane-specific certification claims | Low, if QA passed — verify `qa_result.json` before delivery |
| "The numbers don't add up" | Arithmetic error or stale data used | All counts/percentages are `deterministic calculation` findings computed from the evidence itself, reproducible by re-running the CLI | Low — reproduce and show the buyer the recomputation |
| "I lost the file / you can't prove what I got" | No copy retained by buyer | `CHECKSUMS.sha256` + `verify_package_dir` let both sides independently confirm package integrity from a retained copy | Medium — operator should retain a copy per engagement per internal record-keeping policy (not enforced by this system) |
| "This took longer / cost more than the pricing worksheet said" | Pricing worksheet used modeled, not observed, assumptions | `11_pricing_hypothesis_worksheet.md` labels every dollar figure `assumption`/`modeled`, never `observed` | Medium-high until enough real runs are logged via `economics/recorder.py` to replace assumptions with observed facts |
