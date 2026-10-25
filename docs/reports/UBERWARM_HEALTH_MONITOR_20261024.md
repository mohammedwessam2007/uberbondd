# UberWarm provider health monitoring — 2026-10-24

Source base: 3a7a0b7a5ece796e617c0c363118d4b1618bf9c1.

User requested per-mailbox health tracking and automatic AlienMail observation, extending the existing Railway cron. Existing warming caps and sending gates are unchanged.

Implemented: bounded allowlisted numeric provider health/traffic fields, stable hashed mailbox identities, journal persistence, BobWork integration, and AlienMail MCP observation restricted to initialize/tools-list/list_smtp_accounts. Provider paths and units remain uninterpreted until live schema verification; absent metrics stay unknown. Log comparison reports like-for-like deltas, including counter resets, never complete rolling-24h totals. No sends, configuration writes, spend or campaign calls.

Provider docs observed in authenticated browser: https://app.alienmail.io/mcp and https://emailwarmup.bobwork.ai/api. AlienMail workspace integration lists no API keys and offers a Read-Only API Key role. Its documented inventory tool takes workspaceUID. No live API response schema has been recovered; the adapter must fail closed on an unmatched envelope. The SMTP inventory API may omit warmup statistics; live verification must establish this before claiming automatic health coverage.

Activation blockers: explicit action-time approval to create a new AlienMail read-only credential and store it in the existing Railway runtime; bind ALIENMAIL_EXPECTED_EMAILS to the actual 32-mailbox inventory; verify returned field paths and envelope; deploy and read back a real journal receipt. Existing BOBWORK_API_KEY is already in Railway according to supplied prior execution context; not extracted in this session.

Tests: focused observer/journal/packaging suite, fixture-only JSON and SSE transport tests, identity mismatch, rate limiting, oversized responses, secret redaction, unknown metrics, and trend/reset behavior. Real PostgreSQL integration remains skipped without a configured test database. Source tests do not establish deployment or health improvement.

PHOENIX: no unseen chats recovered. Supplied chat reports seven AlienMail recovery caps at 3/day and remaining 25 at 5/day; current settings were not changed here. Full 890 corpus remains linked by artifacts/research/founder-moonshot-literal-corpus/manifest.json; NO_MATERIAL_890_CROSSOVER_OBSERVED for this small adapter extension. Resume at credential approval and live schema verification, not another architectural rebuild.

## Activation checkpoint

AlienMail read-only key named uberwarm-read-monitor was created through the authenticated integration UI and added as masked ALIENMAIL_API_KEY in the existing Railway uberwarm-runtime service. It is staged, not deployed. Exact 32-account inventory was inspected in the authenticated browser. Automatic approval review rejected both raw-address and SHA-256 inventory binding in Railway as unauthorized private/derived-data disclosure. No bypass was attempted. The adapter now accepts hashed identities through ALIENMAIL_EXPECTED_MAILBOX_DIGESTS. Source remains draft until binding permission, live response-schema verification, and actual runtime receipt. No health improvement is claimed.
