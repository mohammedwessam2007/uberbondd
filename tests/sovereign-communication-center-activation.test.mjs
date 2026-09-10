import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const scriptUrl = new URL('../ops/sovereign/activate-communication-center.sh', import.meta.url);
const source = readFileSync(scriptUrl, 'utf8');

test('communication center activation entrypoint is executable and shell-valid', () => {
  assert.notEqual(statSync(scriptUrl).mode & 0o111, 0);
  const parsed = spawnSync('bash', ['-n', scriptUrl.pathname], { encoding:'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
});

test('founder activation defaults to automatic private-LAN access with an explicit loopback escape hatch', () => {
  assert.match(source, /ACCESS_MODE="\$\{4:-auto\}"/);
  assert.match(source, /ACCESS_MODE" == 'loopback'/);
  assert.match(source, /PRIVATE_RFC1918_IPV4/);
  assert.doesNotMatch(source, /0\.0\.0\.0/);
});

test('automatic selection follows the lowest-metric real default route instead of Docker or a random private interface', () => {
  assert.match(source, /fs\.readFileSync\('\/proc\/net\/route'/);
  assert.match(source, /fields\[1\] !== '00000000'/);
  assert.match(source, /fields\[7\] !== '00000000'/);
  assert.match(source, /bestMetric = Math\.min/);
  assert.match(source, /bestIfaces\.length !== 1/);
  assert.match(source, /virtual-default-route-refused/);
  assert.match(source, /docker\|br-\|veth\|virbr\|cni\|flannel\|podman\|tailscale\|tun\|tap\|wg\|zt/);
});

test('automatic selection accepts only one usable RFC1918 IPv4 address on that default interface', () => {
  assert.match(source, /a === 10/);
  assert.match(source, /a === 172 && b >= 16 && b <= 31/);
  assert.match(source, /a === 192 && b === 168/);
  assert.match(source, /d === 0 \|\| d === 255/);
  assert.match(source, /candidates\.length !== 1/);
  assert.match(source, /no-private-address-on-default-route/);
  assert.match(source, /ambiguous-private-address/);
});

test('ambiguity fails closed instead of guessing a founder-control address', () => {
  assert.match(source, /Automatic private-LAN detection refused to guess/);
  assert.match(source, /exit 2/);
  assert.doesNotMatch(source, /sort\(\).*\[0\]/s);
});

test('entrypoint delegates to the hardened sovereign bootstrap and adds no cloud or effect authority', () => {
  assert.match(source, /bootstrap-founder-node\.sh/);
  assert.match(source, /exec "\$BOOTSTRAP" "\$ROOT"/);
  assert.doesNotMatch(source, /\bcurl\b|\bwget\b|git\s+clone|OPENAI_API_KEY|ANTHROPIC_API_KEY|VERCEL_TOKEN|GITHUB_TOKEN|PAYPAL|STRIPE|release-private\.pem/i);
});
