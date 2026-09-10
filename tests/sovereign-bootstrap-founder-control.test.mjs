import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const consoleSource=readFileSync(new URL('../src/sovereign-founder-console.mjs',import.meta.url),'utf8');
const authorctl=readFileSync(new URL('../ops/sovereign/uberbond-authorctl',import.meta.url),'utf8');

test('founder can ask direct readiness questions through the fixed local control vocabulary',()=>{
  assert.match(consoleSource,/FOUNDER_CONSOLE_COMMANDS[^\n]+doctor/);
  assert.match(consoleSource,/\['doctor','doctor'\]/);
  assert.match(consoleSource,/\['are you ready','doctor'\]/);
  assert.match(consoleSource,/\['can you finish yourself','doctor'\]/);
});

test('authorctl doctor delegates only to the local sovereign bootstrap collector',()=>{
  assert.match(authorctl,/doctor\(\)/);
  assert.match(authorctl,/scripts\/sovereign-bootstrap-doctor\.mjs/);
  assert.match(authorctl,/doctor\) doctor/);
  assert.doesNotMatch(authorctl,/api\.github|vercel\.com|curl\s+https|wget\s+https/i);
});

test('doctor wiring does not expand the founder control authority statement',()=>{
  assert.match(authorctl,/does not merge, sign, deploy, send/);
  assert.match(authorctl,/spend, mutate DNS\/credentials, contact customers/);
});
