# N11 independent public DNS observation setup (2026-10-14)
- This High branch starts from previously verified High audit commit `86344a8c82d4ad147d270b297c8c82ef2ef43039`, not Claude or Work branch.
- Authoritative user-owned 10 Startup domains and separate pilot `cedarpointdomains.com` listed in Work provider ledger.
- Read-only `dig` from GitHub Actions to public resolvers Cloudflare and Google, for NS/MX/SPF/TXT DKIM selector and DMARC; emits only per-domain booleans, not TXT/secret values.
- Full live provider receiver signing, Return-Path, PTR, TLS, ISP reputation, warming, exact mail send are NOT tested and remain N11 OPEN.
- No DNS/NS changes, sends, provider accounts, billing or protected credentials. No previous source files changed.
- Status outcome requires actual hosted run and log receipt, and discrepancies are evidence, not authorization to mutate DNS.
