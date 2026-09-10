import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../scripts/sovereign-founder-console-server.mjs', import.meta.url), 'utf8');

test('private-network browser shell is reachable before bearer auth but exposes no API data', () => {
  const pageRoute = server.indexOf("if (req.method === 'GET' && req.url === '/')");
  const authGate = server.indexOf('if (!authorized(req))');
  const statusRoute = server.indexOf("if (req.method === 'GET' && req.url === '/api/status')");
  const commandRoute = server.indexOf("if (req.method === 'POST' && req.url === '/api/command')");
  assert.ok(pageRoute >= 0, 'founder shell route must exist');
  assert.ok(authGate > pageRoute, 'static shell must be servable before bearer auth');
  assert.ok(statusRoute > authGate, 'status data must stay behind bearer auth');
  assert.ok(commandRoute > authGate, 'control/dialogue API must stay behind bearer auth');
});

test('founder token stays in page memory and is sent only as a bearer header', () => {
  assert.match(server, /type=\"password\"/);
  assert.match(server, /autocomplete=\"off\"/);
  assert.match(server, /let authToken=''/);
  assert.match(server, /h\.authorization='Bearer '\+authToken/);
  assert.doesNotMatch(server, /localStorage|sessionStorage|document\.cookie/i);
  assert.doesNotMatch(server, /[?&]token=/i);
});

test('strong-token shell does not auto-call protected status before unlock', () => {
  assert.match(server, /if\(!\$\{binding\.tokenRequired \? 'true' : 'false'\}\)load\(\)/);
  assert.match(server, /function unlock\(\).*authToken=t\.value.*t\.value=''[^]*load\(\)/);
});
