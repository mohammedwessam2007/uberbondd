# UberWarm tiny callback sidecar

A small independent deployable webhook and unsubscribe service isolated from the heavyweight UberBond application build. Contains exact signed Winnr raw-body verification, PostgreSQL idempotent receipt and irreversible canonical suppression.

Set `DATABASE_URL` only for the verified canonical suppression database; `WINNR_WEBHOOK_SECRET` is created by Winnr when a registered endpoint exists; `UBERWARM_UNSUBSCRIBE_SECRET` is a separate protected HMAC secret. All configuration is encrypted in the serving platform. Never put these values in Git/chat/logs.

GET /api/health is read-only and discloses only boolean configuration presence; POST /api/webhooks/winnr rejects unsigned/invalid/stale messages; GET /api/unsubscribe is non-mutating; POST /api/unsubscribe adds canonical suppression. No sending capability exists.

Provider writes, endpoint creation and registration require a responding HTTPS route and real signature secret, an exact shared database, and independent live DB readback. Tests alone are not production proof.
