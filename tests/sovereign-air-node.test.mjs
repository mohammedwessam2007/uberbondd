import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const activateUrl=new URL('../ops/sovereign/activate-air-node.sh',import.meta.url);
const configureUrl=new URL('../ops/sovereign/configure-founder-console-tailnet.sh',import.meta.url);
const activate=readFileSync(activateUrl,'utf8');
const configure=readFileSync(configureUrl,'utf8');

test('Air Node scripts are executable and shell-valid',()=>{
  for(const u of [activateUrl,configureUrl]){
    assert.notEqual(statSync(u).mode & 0o111,0);
    const r=spawnSync('bash',['-n',u.pathname],{encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);
  }
});

test('Air Node requires an already-authenticated running Tailscale backend',()=>{
  assert.match(activate,/tailscale status --json/);
  assert.match(activate,/BackendState!=='Running'/);
  assert.match(activate,/tailscale up/);
  assert.match(configure,/BackendState!=='Running'/);
});

test('Air Node binds only to its own unique Tailscale IPv4 address',()=>{
  for(const s of [activate,configure]){
    assert.match(s,/tailscale ip -4/);
    assert.match(s,/100/);
    assert.match(s,/64/);
    assert.match(s,/127/);
  }
  assert.match(configure,/requested address is not this Air Node Tailscale address/);
  assert.match(configure,/100\.64\.0\.0\/10/);
});

test('Air Node bootstraps locally before adding remote founder reachability',()=>{
  const bootstrap=activate.indexOf('"$BOOTSTRAP" "$ROOT" "$1" "$2" "$3"');
  const expose=activate.indexOf('"$TAILNET_CONFIG" "$TAIL_IP"');
  assert.ok(bootstrap>=0&&expose>bootstrap);
  assert.match(activate,/canonical doctor and first wake succeed/i);
});

test('tailnet exposure preserves strong token and rollback custody',()=>{
  assert.match(configure,/crypto\.randomBytes\(32\)/);
  assert.match(configure,/\^\[0-9a-f\]\{64\}\$/);
  assert.match(configure,/Founder token \(shown once/);
  assert.match(configure,/rollback\(\)/);
  assert.match(configure,/prior config restored/);
  assert.match(configure,/0640 -o root -g uberbond-author/);
});

test('Air Node creates no public tunnel or cloud-provider/effect authority',()=>{
  const combined=`${activate}\n${configure}`;
  assert.doesNotMatch(combined,/(^|\n)\s*tailscale\s+funnel\b/m);
  assert.doesNotMatch(combined,/0\.0\.0\.0|OPENAI_API_KEY|ANTHROPIC_API_KEY|VERCEL_TOKEN|GITHUB_TOKEN|PAYPAL|STRIPE|release-private\.pem/i);
  assert.doesNotMatch(combined,/\bcurl\b|\bwget\b|apt(?:-get)?\s+install|npm\s+(?:install|i)|git\s+clone/i);
  assert.match(configure,/No Tailscale Funnel/);
});
