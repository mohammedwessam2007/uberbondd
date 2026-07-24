# Revenue Leak Diagnostic Report

**Period:** 2026-07

## Executive Summary
7 lead-path issue(s) found across 3 site(s).

## Defect Cards
- **[medium] missing_phone_lead_path** -- This may reduce how easily a visitor can call the business; actual impact is not measured by this check. _Recommendation: Add a visible tel: link near the top of the page._
- **[low] missing_email_lead_path** -- This may reduce how easily a visitor can email the business; actual impact is not measured by this check. _Recommendation: Review this finding with a developer before making any change._
- **[medium] missing_contact_lead_path** -- This may reduce how easily a visitor can find a contact page; actual impact is not measured by this check. _Recommendation: Add or restore a working link to a contact page._
- **[medium] missing_lead_form** -- This may reduce how easily a visitor can submit an inquiry; actual impact is not measured by this check. _Recommendation: Add a lead-capture form to the page._
- **[low] missing_call_to_action** -- This may reduce how easily a visitor can take the next step; actual impact is not measured by this check. _Recommendation: Add a clear call-to-action (e.g. "Get a Quote" or "Call Now")._
- **[low] missing_call_to_action** -- This may reduce how easily a visitor can take the next step; actual impact is not measured by this check. _Recommendation: Add a clear call-to-action (e.g. "Get a Quote" or "Call Now")._
- **[low] missing_call_to_action** -- This may reduce how easily a visitor can take the next step; actual impact is not measured by this check. _Recommendation: Add a clear call-to-action (e.g. "Get a Quote" or "Call Now")._

## Roadmap
1. missing_phone_lead_path (medium, ~2h)
2. missing_contact_lead_path (medium, ~2h)
3. missing_lead_form (medium, ~2h)
4. missing_email_lead_path (low, ~1h)
5. missing_call_to_action (low, ~1h)
6. missing_call_to_action (low, ~1h)
7. missing_call_to_action (low, ~1h)

## Limitations
- This report reflects automated lead-path checks only; it is not a security audit or a guarantee of revenue impact.
- No form on any checked site was submitted; form presence and action availability are checked structurally only.
- Visual and mobile-viewport checks compare screenshot hashes, not a rendered pixel diff.
- Every claim in this report is linked to a specific evidence item captured during this diagnostic.