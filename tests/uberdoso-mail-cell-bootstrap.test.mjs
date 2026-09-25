import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bootstrap = new URL('../ops/sovereign/bootstrap-uberdoso-mail-cell.sh', import.meta.url);
const verify = new URL('../ops/sovereign/verify-uberdoso-mail-cell.sh', import.meta.url);
const lock = JSON.parse(fs.readFileSync(new URL('../config/uberdoso-source-lock.json', import.meta.url), 'utf8'));

function syntax(path) {
  const result = spawnSync('bash', ['-n', fileURLToPath(path)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

test('UberDoso bootstrap and verifier are shell-syntax clean', () => {
  syntax(bootstrap);
  syntax(verify);
});

test('UberDoso bootstrap consumes canonical immutable pins and preserves external gates', () => {
  const source = fs.readFileSync(bootstrap, 'utf8');
  assert.match(source, /uberdoso-source-lock\.json/);
  assert.match(source, /runtimeImageDigest/);
  assert.match(source, /postal bootstrap --version/);
  assert.match(source, /UBERDOSO_POSTAL_PROVISIONED_UNVERIFIED/);
  assert.match(source, /sendAuthority:'NONE_UNTIL_PUBLIC_DNS_PTR_PORT25_AND_UBERBOND_GATES_PASS'/);
  assert.doesNotMatch(source, /OUTBOUND_ENABLED=true/);
  assert.match(lock.postal.runtimeImageDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(lock.mariaDb.runtimeImageDigest, /^sha256:[a-f0-9]{64}$/);
});

test('mail-cell verifier does not self-certify inbound port 25 or public DNS', () => {
  const source = fs.readFileSync(verify, 'utf8');
  assert.match(source, /inboundPort25Observed:false/);
  assert.match(source, /inbound-port-25-must-be-observed-from-outside-host/);
  assert.match(source, /publish-and-observe-public-dns-records/);
  assert.match(source, /sendAuthority:'NONE'/);
});

const provisioner = new URL('../scripts/uberdoso-postal-provision.rb', import.meta.url);
const { OUTREACH_FLEET_DOMAINS } = await import('../src/outreach-domain-fleet.mjs');
const hasRuby = spawnSync('ruby', ['-v'], { encoding: 'utf8' }).status === 0;

test('the Postal provisioner fleet allowlist is exactly the verified outreach fleet', () => {
  const source = fs.readFileSync(provisioner, 'utf8');
  const block = source.match(/OUTREACH_FLEET = %w\[([\s\S]*?)\]\.freeze/);
  assert.ok(block, 'OUTREACH_FLEET literal required');
  assert.deepEqual(block[1].trim().split(/\s+/).sort(), [...OUTREACH_FLEET_DOMAINS].sort());
  assert.match(source, /ROOTS = \["uberbond\.agency", "uberbond\.cloud"\]\.freeze/);
});

test('bootstrap forwards only a validated sender list and counts it in the receipt check', () => {
  const source = fs.readFileSync(bootstrap, 'utf8');
  assert.match(source, /-e UBERDOSO_POSTAL_SENDER_DOMAINS="\$UBERDOSO_POSTAL_SENDER_DOMAINS"/);
  assert.match(source, /\^\[a-z0-9\.-\]\+\(,\[a-z0-9\.-\]\+\)\*\$/);
  assert.match(source, /const expected=2\+String\(senderList/);
  assert.doesNotMatch(source, /x\.domains\.length!==2\)/);
});

test('provisioner selects roots plus explicitly named fleet domains and refuses anything else', { skip: !hasRuby && 'ruby not installed' }, () => {
  const run = value => spawnSync('ruby', ['-e', `load ${JSON.stringify(fileURLToPath(provisioner))}; begin; puts JSON.generate(uberdoso_domains(ARGV[0])); rescue UberDosoProvisionError => e; puts JSON.generate(error: e.message); end`, value], {
    encoding: 'utf8', env: { ...process.env, UBERDOSO_PROVISION_LIBRARY_ONLY: '1' }
  });
  const parse = value => { const r = run(value); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  assert.deepEqual(parse(''), ['uberbond.agency', 'uberbond.cloud']);
  assert.deepEqual(parse('uberbondhq.site, UBERBONDLABS.site.'), ['uberbond.agency', 'uberbond.cloud', 'uberbondhq.site', 'uberbondlabs.site']);
  assert.deepEqual(parse('uberbond.example'), { error: 'sender-domain-not-in-verified-outreach-fleet:uberbond.example' });
  assert.deepEqual(parse('uberbondhq.site,uberbondhq.site'), { error: 'duplicate-sender-domain' });
});
