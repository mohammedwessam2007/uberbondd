import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const observer=readFileSync(new URL('../ops/sovereign/observe-runtime-graduation.mjs',import.meta.url),'utf8');
const service=readFileSync(new URL('../ops/sovereign/uberbond-runtime-graduation.service',import.meta.url),'utf8');
const timer=readFileSync(new URL('../ops/sovereign/uberbond-runtime-graduation.timer',import.meta.url),'utf8');
const installer=readFileSync(new URL('../ops/sovereign/install-host.sh',import.meta.url),'utf8');

test('observer is read-only toward signing and deployment authority',()=>{assert.doesNotMatch(observer,/release-private|UBERBOND_RELEASE_SIGNING_KEY|openssl\s+dgst.*-sign|\bdeploy\s*\(/i);assert.doesNotMatch(observer,/uberbondctl.*deploy|docker\s+(restart|stop|rm|compose)/i);assert.match(observer,/signer-receipt\.json/);assert.match(observer,/courier-receipt\.json/);assert.match(observer,/APPLIED-/);assert.match(observer,/state\.env/);});
test('observer requires reconciliation after the applied marker and live runtime health',()=>{assert.match(observer,/uberbond-reconcile\.timer/);assert.match(observer,/uberbond-reconcile\.service/);assert.match(observer,/serviceAt>=appliedAt/);assert.match(observer,/uberbond-postgres/);assert.match(observer,/uberbond-web/);assert.match(observer,/uberbond-worker/);assert.match(observer,/compileSovereignRuntimeGraduation/);});
test('observer cannot call public network services',()=>{assert.doesNotMatch(observer,/https?:\/\//i);assert.doesNotMatch(observer,/curl|wget|api\.github|vercel\.com|openai\.com|anthropic\.com/i);});
test('observer writes canonical receipt only after evidence compiles successfully',()=>{assert.match(observer,/if\(out\.ok\)await atomic\(path\.join\(controlDir,'runtime-receipt\.json'\)/);});
test('systemd observer is zero-IP and cannot write signer outbox or runtime inbox',()=>{assert.match(service,/RestrictAddressFamilies=AF_UNIX/);assert.match(service,/IPAddressDeny=any/);assert.match(service,/ReadOnlyPaths=.*uberbond-signer-outbox.*uberbond-control\/inbox/);assert.match(service,/ReadWritePaths=\/var\/lib\/uberbond-control/);assert.match(service,/SuccessExitStatus=2/);});
test('runtime observer is durable and installed with its exact validation module',()=>{assert.match(timer,/OnUnitActiveSec=60s/);assert.match(timer,/Persistent=true/);assert.match(installer,/runtime-observer\/ops\/sovereign\/observe-runtime-graduation\.mjs/);assert.match(installer,/runtime-observer\/src\/sovereign-runtime-graduation\.mjs/);assert.match(installer,/uberbond-runtime-graduation\.timer/);});
