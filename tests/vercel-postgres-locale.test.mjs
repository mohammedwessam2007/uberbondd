import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wrapper=readFileSync('scripts/with-real-postgres.mjs','utf8');
const disposable=readFileSync('scripts/disposable-postgres.mjs','utf8');

for(const [name,source] of [['with-real-postgres',wrapper],['disposable-postgres',disposable]]){
 test(`${name} pins a portable initdb locale`,()=>{
  for(const key of ['LANG','LC_ALL','LC_CTYPE','LC_MESSAGES','LC_COLLATE']){
   assert.match(source,new RegExp(`${key}: 'C'`));
  }
  assert.doesNotMatch(source,/C\.UTF-8|en_US\.UTF-8/);
 });
}

test('disposable fixture restores caller locale before running the test body',()=>{
 const restore=disposable.indexOf('restoreOnce();');
 const body=disposable.indexOf('return await body(');
 assert.ok(restore>=0&&body>restore,'parent locale must be restored before callback execution');
 assert.match(disposable,/if \(previous\[key\] === undefined\) delete process\.env\[key\]/);
});

test('real-postgres wrapper passes the same portable locale into the child command',()=>{
 assert.match(wrapper,/\.\.\.POSTGRES_LOCALE_ENV/);
 assert.match(wrapper,/Object\.assign\(process\.env, POSTGRES_LOCALE_ENV\)/);
});
