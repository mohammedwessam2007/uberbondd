import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../scripts/sovereign-bootstrap-doctor.mjs',import.meta.url),'utf8');

test('doctor is local evidence collection rather than a cloud activation path',()=>{assert.doesNotMatch(source,/https:\/\//);assert.doesNotMatch(source,/api\.github|vercel\.com|openai\.com|anthropic\.com/i);assert.match(source,/systemctl/);assert.match(source,/http:\/\/\$\{host\}:\$\{port\}\/api\/status/);});
test('doctor requires real source contracts and exact local git truth',()=>{assert.match(source,/git',\['rev-parse','HEAD'\]/);assert.match(source,/git',\['status','--porcelain'\]/);assert.match(source,/REQUIRED_SOURCE_CONTRACTS/);assert.match(source,/runtimeGraduationObserver:'ops\/sovereign\/observe-runtime-graduation\.mjs'/);assert.match(source,/lstat/);assert.match(source,/isSymbolicLink/);});
test('doctor never infers the separate signing or courier authority from authoring-host configuration',()=>{assert.match(source,/separateSignerObserved:false,releaseCourierObserved:false/);assert.match(source,/separate offline signer is never inferred/i);assert.doesNotMatch(source,/releaseCourierObserved:active\(/);});
test('doctor consumes only the bounded runtime receipt path for graduation evidence',()=>{assert.match(source,/runtime-receipt\.json/);assert.match(source,/compileSovereignBootstrapReadiness/);assert.match(source,/exact correlated runtime-receipt contract/i);});
test('doctor exits nonzero until the local self-completion loop is actually ready',()=>{assert.match(source,/selfCompletionLoopReady!==true/);assert.match(source,/process\.exitCode=2/);});
