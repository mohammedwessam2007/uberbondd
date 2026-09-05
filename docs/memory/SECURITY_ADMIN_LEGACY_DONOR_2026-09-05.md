# Security donor receipt: legacy privileged admin client

The pre-hardening admin client remains recoverable for provenance and mechanism archaeology, but is quarantined from the public executable surface.

- Source PR: #393
- Historical executable blob: `34767655330726fe9886524f3dce16956bcb1a50`
- Historical path: `public/admin-legacy.js`
- Unsafe mechanisms preserved as evidence only: privileged bearer persistence in `localStorage`; protected download URLs carrying `?token=`; Gmail OAuth launch URLs carrying the privileged bearer in the query string.
- Current law: privileged admin bearer is browser-memory-only and travels only in authenticated request headers. Historical code does not regain authority or callability merely because it remains recoverable.

This receipt satisfies no-amputation by preserving exact provenance without continuing to serve the vulnerable implementation as executable public JavaScript.
