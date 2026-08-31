# MCP Server Recommendations

Source: Anthropic `claude-code-setup` pinned at `ed404106fcd80ba98ecb7c851e531dcb626d13b7`.

MCP servers connect Claude to external tools/services. UberBond already ships `.mcp.json` with its own canonical MCP server. New MCPs are suppliers, never replacement truth systems.

## Common candidates

- **context7**: current documentation for popular frameworks/SDKs.
- **Playwright**: browser automation/testing for frontend flows.
- **PostgreSQL / Neon / Supabase / Convex**: database/deployment introspection where the project actually uses the service.
- **GitHub**: issues, PRs, Actions and release workflows.
- **Vercel / AWS / Cloudflare**: cloud deployment/infrastructure where authorized.
- **Sentry / Datadog**: production observability.
- **Slack / Notion / Linear**: team workflow integrations.
- **Docker / Kubernetes**: container/cluster operations.
- **Exa**: current web research.
- **Memory MCPs**: working memory only; UberBond repository memory remains canonical.

## UberBond admission questions

Before adding an MCP, record:
1. exact capability gap;
2. why existing UberBond tools cannot satisfy it;
3. data/secret scope;
4. read vs write surface;
5. external effects and authority required;
6. provider identity and receipts;
7. cost;
8. fallback/rollback;
9. license/terms where applicable;
10. expected founder-minute or economic benefit.

Checked-in project MCP configuration belongs in `.mcp.json`. Do not add credentials to it.
