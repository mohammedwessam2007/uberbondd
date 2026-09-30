import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const plugin=JSON.parse(fs.readFileSync(new URL('../typingmind/infinite-opus/plugin.json',import.meta.url),'utf8'));

test('TypingMind plugin exposes only scoped UberMind status and plan tools',()=>{
 assert.equal(plugin.title,'UberMind Infinite Opus Gateway');
 assert.equal(plugin.authenticationType,'AUTH_TYPE_NONE');
 assert.deepEqual(plugin.pluginFunctions.map(x=>x.openaiSpec.name).sort(),['ubermind_gateway_status','ubermind_plan_task']);
 assert.equal(plugin.userSettings.find(x=>x.name==='gatewayToken')?.type,'password');
});

test('plugin carries no secret or OpenRouter inference credential',()=>{
 const s=JSON.stringify(plugin);
 assert.equal(/sk-or-v1-[A-Za-z0-9_-]{8,}/.test(s),false);
 assert.equal(/OPENROUTER_API_KEY|ADMIN_TOKEN/.test(s),false);
 assert.ok(s.includes('gatewayToken'));
});

test('planning tool hard-codes zero external side effects',()=>{
 const fn=plugin.pluginFunctions.find(x=>x.openaiSpec.name==='ubermind_plan_task');
 assert.ok(fn.code.includes("sideEffectClass:'NONE'"));
 assert.equal(fn.openaiSpec.parameters.properties.sideEffectClass,undefined);
 assert.ok(fn.code.includes('/api/ubermind/v1/plan'));
});
