# PHOENIX HIGH | live Render deployed source versus tested H09 source

Observation 2026-10-15 UTC from the connected provider account, **read-only**, service `srv-dali9vijnfac739m4vcg`.

**WE HAVE DONE:** Queried Render `get_service` with authorized workspace `tea-d96rqhepuehc73et0i40` and `list_deploys` limit 4. Service `uberbond-control-plane` is `web_service`, Free plan, source repo `https://github.com/mohammedwessam2007/uberbondd`, tracked branch `main`, not suspended. Public service URL `https://uberbond-control-plane.onrender.com`.

**VERIFIED LIVE DEPLOYMENT:** Most recent Render deploy `dep-db4h3a9srm7s73b3o040`, status `live`, deployed source exact Git commit **`24854739d70617d57807cde5407a84266cca477c`** (Oct 9); this is not the current GitHub main `298bd585d3ba0cf1fe5cdc2f81a525eb67819608`, not H02 source `4071fe42...`, and not the green H09 PR #1436 tested source `15a43485...`. Published source is older than the new reviewed source. GitHub's PR #1436 merge-ref tree `871d60c0c8e64afa6c38ff8c67a1554ad13af0d8` is identical to the head's tree, but GitHub CI or pull request merge reference cannot prove Render deployment.

**Production database:** Separate original Render PG16 Free `dpg-dali9dbl550s73bcf520-a` remains available with explicit expiration **2026-10-16T23:22:29.055606Z**, empty external IP allowlist unchanged. High hosted MCP cannot inspect source-current SQL or original encryption key through that safe configuration. Neon archives are historical as of 2026-10-14 01:00Z, not an independently verified fresh writer-current production backup.

**WHAT IS LEFT / NEXT:** Acquire protected Render internal DB/key binding and fresh consistent backup plus verified isolated Neon restore/app boot/writer delta before expiry using the Work-only account action in issue #1188 comment 6180051799. Then independently review and integrate approved code before an authorized production deploy; verify actual deploy ID, SHA, boot/connectivity, sender holds, rollback. Real Winnr protected 50+3 and lawful campaign approval are separate provider/effect gates.

**SAFETY:** All actions here READ-ONLY; no deploy, production DB mutation, secret access, IP allowlist change, sends, purchases or DNS changes. SEND_SET=[].
