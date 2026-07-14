# Known Limitations

1. **No revenue guarantee.** The system automates acquisition and delivery mechanics, not market demand.
2. **No real Gmail live-send validation in this release test environment.** Automated tests use a mocked provider and real PostgreSQL transactions. A controlled deployed test is still required.
3. **Provider complaint handling depends on available signals.** Gmail replies can reveal bounces and some automated responses, but a production sender should also observe provider and domain reputation dashboards.
4. **Jurisdiction choice remains an owner decision.** Country allowlists enforce policy after configuration; they do not decide whether a campaign is legally permitted. Technical safeguards are not legal advice.
5. **Timezone resolution is bounded.** Recipient-local hours depend on supported country and location mapping. Ambiguous locations are blocked rather than guessed for unattended sending.
6. **Contact verification is only as reliable as its evidence.** First-party publication and approved verification results reduce risk but do not guarantee mailbox ownership, engagement, or legal permission.
7. **External services require owner accounts.** Gmail, payment, AI, contact verification, DNS, hosting, and external discovery need real credentials and staged tests.
8. **PostgreSQL artifact storage is a launch-stage compromise.** It makes separate Web and Worker services functional without another account. Move high screenshot volume to S3-compatible storage later.
9. **Some websites block automation.** The Worker respects access restrictions and does not bypass CAPTCHAs or protected platforms.
10. **AI is optional and fallible.** Deterministic evidence remains the source of truth. AI output must pass validation before entering the queue.
11. **Ambiguous Gmail results require human review.** A reservation marked `uncertain` is intentionally not retried automatically.
12. **High-value implementation remains human-assisted.** Reports and monitoring can be automated; custom creative and technical delivery still benefit from judgment.
13. **Deliverability must be earned gradually.** Authentication, list quality, low volume, relevance, and recipient behavior determine outcomes outside the application.
