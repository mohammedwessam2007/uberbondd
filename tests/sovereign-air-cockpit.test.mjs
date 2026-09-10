import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const cockpit = read('ops/sovereign/init-air-cockpit.sh');
const compose = read('docker-compose.sovereign.yml');
const ui = read('public/ops.js');

test('sovereign web defaults private and never binds all public interfaces', () => {
  assert.match(compose, /HOST_BIND:-127\.0\.0\.1/);
  assert.doesNotMatch(compose, /0\.0\.0\.0:.*8080/);
});

test('air cockpit binds web only to the private WireGuard address', () => {
  assert.match(cockpit, /SERVER_ADDR=.*10\.73\.0\.1\/24/);
  assert.match(cockpit, /HOST_BIND=%s/);
  assert.match(cockpit, /FOUNDER_COCKPIT_TRANSPORT=wireguard/);
  assert.doesNotMatch(cockpit, /HOST_BIND=0\.0\.0\.0/);
});

test('air cockpit has no hosted tunnel or cloud-control dependency', () => {
  for (const forbidden of ['tailscale', 'cloudflare', 'ngrok', 'vercel', 'github api', 'aws', 'azure']) {
    assert.doesNotMatch(cockpit.toLowerCase(), new RegExp(`\\b${forbidden.replace(' ', '\\s+')}\\b`));
  }
});

test('runtime never receives release signing private key', () => {
  assert.match(cockpit, /release signing private key must never live on runtime host/i);
  assert.doesNotMatch(cockpit, /release-private\.pem.*install/);
});

test('client private key is written to owner-only file and never intentionally printed', () => {
  assert.match(cockpit, /CLIENT_CONF=.*uberbond-ipad\.conf/);
  assert.match(cockpit, /chmod 600 "\$CLIENT_CONF"/);
  assert.match(cockpit, /client private key was NOT printed/i);
  assert.doesNotMatch(cockpit, /echo\s+"?\$CLIENT_PRIVATE/);
  assert.doesNotMatch(cockpit, /printf[^\n]*CLIENT_PRIVATE/);
});

test('cockpit is a thin client rather than local execution substrate', () => {
  assert.match(ui, /fetch\(path/);
  assert.match(ui, /setInterval\([^]*30000/);
  for (const heavy of ['WebGPU', 'Worker(', 'SharedWorker(', 'indexedDB', 'WebAssembly.compile', 'navigator.gpu']) {
    assert.doesNotMatch(ui, new RegExp(heavy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('network reachability remains an explicit physical gate', () => {
  assert.match(cockpit, /NETWORK GATE:/);
  assert.match(cockpit, /CGNAT/);
  assert.match(cockpit, /owner-controlled routable node/);
});
