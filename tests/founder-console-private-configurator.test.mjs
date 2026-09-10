import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const configurator = readFileSync(new URL('../ops/sovereign/configure-founder-console-private.sh', import.meta.url), 'utf8');
const installer = readFileSync(new URL('../ops/sovereign/install-authoring-node.sh', import.meta.url), 'utf8');

test('private founder-console configurator refuses wildcard and public addresses by positive RFC1918 admission', () => {
  assert.match(configurator, /nums\[0\]===10/);
  assert.match(configurator, /nums\[0\]===172&&nums\[1\]>=16&&nums\[1\]<=31/);
  assert.match(configurator, /nums\[0\]===192&&nums\[1\]===168/);
  assert.match(configurator, /specific RFC1918 IPv4 host address, never wildcard\/public/);
  assert.doesNotMatch(configurator, /0\.0\.0\.0.*activated/);
});

test('configurator generates a 256-bit token and never puts it in argv or a URL', () => {
  assert.match(configurator, /crypto\.randomBytes\(32\)\.toString\('hex'\)/);
  assert.match(configurator, /\^\[0-9a-f\]\{64\}\$/);
  assert.doesNotMatch(configurator, /[?&]token=/i);
  assert.match(configurator, /FOUNDER_CONSOLE_TOKEN',process\.env\.TOKEN/);
});

test('config update is transactional and permission-bound', () => {
  assert.match(configurator, /mktemp \/etc\/uberbond\/\.founder-console\.backup/);
  assert.match(configurator, /install -m 0640 -o root -g uberbond-author "\$STAGE" "\$CONFIG"/);
  assert.match(configurator, /systemctl is-active --quiet uberbond-founder-console\.service/);
  assert.match(configurator, /prior config restored/);
});

test('authoring installer exposes the configurator as a first-party control tool', () => {
  assert.match(installer, /configure-founder-console-private\.sh/);
  assert.match(installer, /Private console:\s+\/opt\/uberbond\/control\/configure-founder-console-private\.sh PRIVATE_RFC1918_IPV4/);
  assert.match(installer, /refuses wildcard\/public addresses/);
});
