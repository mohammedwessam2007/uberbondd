import test from 'node:test';
import assert from 'node:assert/strict';
import { needsDedicatedPostgresOsUser } from '../scripts/disposable-postgres.mjs';

test('root account requests dedicated unprivileged PostgreSQL OS user',()=>{
 assert.equal(needsDedicatedPostgresOsUser(()=>0),true);
});
test('normal CI user does not attempt system groupadd or chown',()=>{
 assert.equal(needsDedicatedPostgresOsUser(()=>1001),false);
 assert.equal(needsDedicatedPostgresOsUser(()=>1000),false);
});
test('unavailable UID lookup does not request privileged system user creation',()=>{
 assert.equal(needsDedicatedPostgresOsUser(undefined),false);
});
test('actual current process identity selects expected effective mode',()=>{
 assert.equal(needsDedicatedPostgresOsUser(),process.getuid()===0);
});
