import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const secret=new URL('../ops/sovereign/store-typesafe-key-interactive.sh',import.meta.url);
const activate=new URL('../ops/sovereign/complete-live-jev-activation.sh',import.meta.url);
const skill=readFileSync(new URL('../.claude/skills/oracle-free-uberlit-jev-activation/SKILL.md',import.meta.url),'utf8');
const secretSource=readFileSync(secret,'utf8');
const activationSource=readFileSync(activate,'utf8');

test('secret installer and activation gate are executable and shell-valid',()=>{
  for(const url of [secret,activate]){
    assert.notEqual(statSync(url).mode&0o111,0);
    const r=spawnSync('bash',['-n',url.pathname],{encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);
  }
});

test('interactive secret installer hides terminal echo and never accepts an argv key',()=>{
  assert.match(secretSource,/stty -echo/);
  assert.match(secretSource,/read -r TYPESAFE_KEY <\/dev\/tty/);
  assert.match(secretSource,/uberlit-typesafe-secret\.mjs" store/);
  assert.doesNotMatch(secretSource,/--api-key|TYPESAFE_API_KEY=/);
});

test('live activation keeps one-mill ceiling, recent pricing evidence, and failure rollback',()=>{
  assert.match(activationSource,/--authorize-max-usd 0\.001/);
  assert.match(activationSource,/n>0\.001/);
  assert.match(activationSource,/30\*24\*60\*60\*1000/);
  assert.match(activationSource,/rollback_enable/);
  assert.match(activationSource,/ensure_env_value TYPESAFE_JEV_ENABLED false/);
  assert.match(activationSource,/uberlit-jev-shadow-canary\.mjs" --execute/);
  assert.match(activationSource,/jev-shadow-route\.mjs" --execute --data-class INTERNAL_NON_SENSITIVE/);
  assert.match(activationSource,/JEV_LIVE_SHADOW_READY/);
  assert.match(activationSource,/canonicalRoutingChanged:false/);
  assert.match(activationSource,/businessEffectAuthority:'NONE'/);
  assert.match(activationSource,/externalEffectAuthority:'NONE'/);
});

test('Cowork skill preserves owner-only auth, legal, secret and spend gates',()=>{
  for(const phrase of ['Owner Gate O1','Owner Gate O2','Owner Gate O3','Never ask the founder to paste the key into Claude chat','Do not circumvent']) assert.ok(skill.includes(phrase),phrase);
  assert.match(skill,/VM\.Standard\.A1\.Flex/);
  assert.match(skill,/2 OCPUs total/);
  assert.match(skill,/12 GB RAM total/);
  assert.match(skill,/\$0\.001 USD/);
  assert.match(skill,/complete-live-jev-activation\.sh --authorize-max-usd 0\.001/);
});
