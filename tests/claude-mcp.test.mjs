import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("UberBond exposes a project-scoped no-secret Claude MCP bridge", async () => {
  const config = JSON.parse(await readFile(new URL("../.mcp.json", import.meta.url), "utf8"));
  const server = config.mcpServers.uberbond;
  assert.equal(server.type, "stdio");
  assert.equal(server.command, "node");
  assert.match(server.args[0], /CLAUDE_PROJECT_DIR/);

  const source = await readFile(new URL("../scripts/uberbond-mcp.mjs", import.meta.url), "utf8");
  const docs = await readFile(new URL("../docs/CLAUDE_UBERBOND_MCP.md", import.meta.url), "utf8");
  for (const tool of ["uberbond_get_state", "uberbond_read_relay_contract", "uberbond_prepare_task", "uberbond_run_verification"]) assert.match(source, new RegExp(tool));
  for (const suite of ["check:syntax", "test:deterministic", "check"]) assert.match(source, new RegExp(suite));
  for (const forbidden of ["deploy", "push", "merge", "credential change", "production mutation"]) assert.match(source, new RegExp(forbidden));
  assert.match(docs, /Approve the trusted project-scoped MCP server/);
  assert.doesNotMatch(source, /ANTHROPIC_API_KEY|CLAUDE_API_KEY/);
});
