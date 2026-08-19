# Gmail API Provider-Policy Boundary

Status checked: 2026-08-09.

UberBond does not use Gmail API scopes for generic unsolicited commercial email. The Google Workspace API User Data and Developer Policy prohibits using Gmail scopes to distribute spam or unsolicited commercial mail and describes CRM bulk commercial mail as an approved use only when recipients consented.

Official source: <https://developers.google.com/workspace/workspace-api-user-data-developer-policy>

For `OUTBOUND_PROVIDER=gmail-api`, the code admits only:

- `SOLICITED_APPLICATION`: a current official opportunity explicitly invites the application;
- `EXPLICIT_CONSENT`: the exact recipient has affirmatively agreed to receive this category of message;
- `REQUESTED_INFORMATION`: the exact recipient asked for this information.

The code denies `PUBLIC_BUSINESS_CONTACT`, `CONSPICUOUS_PUBLICATION`, `WARM_REFERRAL`, and `UNKNOWN` on this provider. A verified or public mailbox proves neither consent nor provider-policy permission.

Local law is a separate gate. For Canada, consult the CRTC CASL guidance and preserve evidence of the route, identity information, contact information, and unsubscribe mechanism: <https://crtc.gc.ca/eng/com500/guide.htm> and <https://crtc.gc.ca/eng/com500/faq500.htm>. For the United States, consult the FTC CAN-SPAM compliance guide: <https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business>.

These sources are operational inputs, not legal advice. If provider policy or law conflicts with a campaign, the stricter boundary wins.
