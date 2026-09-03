import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const text=fs.readFileSync(new URL('../docs/memory/GENESIS_275_IMPLEMENTATION_2026-09-03.md',import.meta.url),'utf8');
test('GENESIS implementation receipt preserves source-vs-runtime-vs-commercial truth',()=>{assert.match(text,/SOURCE\/TEST SURFACE IMPLEMENTED/);assert.match(text,/Source\/test presence is not a test pass/);assert.match(text,/Exact-head green Vercel execution is still required/);assert.match(text,/0 customers, USD 0 cleared revenue/);});
