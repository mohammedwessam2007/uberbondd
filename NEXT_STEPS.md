# Next Steps

## Completed engineering layers

- Automatic permitted business discovery
- Browser audits and evidence capture
- PostgreSQL production source of truth
- Durable PostgreSQL job queue
- Separate Web and Worker processes
- Retries, dead letters, crash recovery, heartbeat, and persisted worker pause
- Shared screenshot artifacts across services
- System and campaign country allowlists
- First-party-published or positively verified contact gate
- Risky-address rejection
- Transactional daily and hourly send capacity
- Minimum sender cadence
- Durable send-step idempotency
- Recipient-local business hours
- Signed unsubscribe and global suppression
- Hard-bounce and complaint sender-health pauses
- Global outbound emergency stop
- One-follow-up maximum by default

## Next phase: staged production deployment

1. Create a private GitHub repository and upload the approved release.
2. Create one managed PostgreSQL database.
3. Deploy the Web and Worker services with outbound and discovery disabled.
4. Verify migrations, health, worker heartbeat, queue status, and screenshot sharing.
5. Connect one authenticated sending inbox through Gmail OAuth.
6. Configure sender-domain authentication and confirm it outside the application.
7. Create test-mode checkout products and verify a signed payment webhook.
8. Test the signed unsubscribe page using a controlled mailbox.
9. Run discovery in preview mode and inspect the candidates.
10. Run one dry-run campaign and review every generated message.
11. Decide the permitted jurisdictions and configure both system and campaign allowlists.
12. Start a tiny observed live campaign only after all launch checks pass.

## After the first controlled campaign

Measure delivered messages, hard bounces, complaints, replies, interested replies, report views, checkouts, revenue, and manual time per sale. Do not scale volume until quality and sender health remain stable.
