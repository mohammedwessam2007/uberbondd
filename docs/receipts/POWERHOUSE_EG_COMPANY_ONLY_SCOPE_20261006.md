# Powerhouse sender-side company-only scope resolution — 2026-10-06

Truth class: `NARROW_INTERNAL_COMPLIANCE_CLASSIFICATION__NO_GENERAL_SEND_AUTHORITY`.

This receipt resolves only the sender-side material-scope fact consumed by the exact Powerhouse effect package. It does **not** declare a blanket Egyptian cold-email exemption, does not replace recipient-side CAN-SPAM requirements, does not authorize any message, and does not apply to named-person, personal-mailbox, enriched-personal-data, or changed-recipient routes.

## Exact bound route

- Prospect id: `pros_d8ced49c-38e1-4d70-8b3d-61a1a2533377`.
- Recipient domain: `mypowerhouse.group`.
- Recipient route: the already-verified generic company role inbox recorded in the protected prospect row.
- Recipient jurisdiction: United States.
- Sender/operator/controller facts used by UberBond for this classification: Egypt.
- Current message/prework is company-level. The route must be re-evaluated if a natural person becomes the target or personal data is introduced.

## Evidence basis

The canonical policy registry already contains current active evidence rows for:

1. `sender:EG:corporate-role-no-personal-data`, sourced to Egypt Law No. 151 of 2020, with material scope recorded as `NATURAL_PERSON_PERSONAL_DATA`.
2. `sender:EG:natural-person-scope-guidance`, sourced to the Egyptian PDPC FAQ, with the data subject recorded as `NATURAL_PERSON`.
3. `recipient:US:can-spam-b2b-email`, sourced to current FTC guidance, retaining accurate headers/subject, commercial identification, postal identity and functional opt-out obligations.
4. `provider:smtp-relay:winnr:cold-b2b-lawful-use`, sourced to Winnr provider evidence, retaining applicable-law, identity, relevance and opt-out obligations.

Current source: `policy/outreach/global-policy-evidence.json`.

## Fail-closed boundary

The migration that records this resolution is locked to the exact prospect id, domain, exact generic role inbox, US jurisdiction, and absence of named-person evidence. It only writes `preflightContext.senderSide`; it neither creates an outreach approval nor binds the live dispatcher. The canonical founder-signed exact-effect authorization, fresh sender health, suppression/history checks, signed unsubscribe URLs and provider governance remain separate gates.

Counsel's bespoke route opinion remains useful parallel evidence and may supersede this internal classification if it contradicts it.
