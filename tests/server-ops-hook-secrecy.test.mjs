import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// server.mjs carries one-shot operator hooks that are swapped in and out as
// production operations need them: the Crown safe-state inventory (#1268), the
// owner-authorized Crown resume (#1266) and the R3 candidate reconciliation
// (#1267) each lived there briefly and were replaced within hours. Their tests
// asserted that each hook's text was present, so they went red the moment the
// hook was retired -- and stayed red, because nothing ran them.
//
// What those tests protected outlives any one hook: an operator log line must
// never carry the sealed Crown material -- candidate answers, rubrics, prompts,
// raw provider responses or the sealed checkpoint itself. This checks every log
// statement in server.mjs, whichever hooks it holds today.

const FORBIDDEN_KEYS = ['answers', 'rubric', 'prompt', 'prompts', 'sealedEvidence', 'providerResponses', 'privateKeyPem'];

/** Each console.log/console.error call, whole, however many lines it spans. */
function logStatements(source) {
  const out = [];
  const opener = /console\.(?:log|error)\(/g;
  let match;
  while ((match = opener.exec(source))) {
    let index = match.index + match[0].length;
    let depth = 1;
    while (index < source.length && depth > 0) {
      if (source[index] === '(') depth++;
      else if (source[index] === ')') depth--;
      index++;
    }
    out.push({ line: source.slice(0, match.index).split('\n').length, text: source.slice(match.index, index) });
  }
  return out;
}

function payloadLeaks(source) {
  const key = new RegExp(`\\b(${FORBIDDEN_KEYS.join('|')})\\b\\s*[:,})]`, 'g');
  return logStatements(source).flatMap(({ line, text }) =>
    [...new Set([...text.matchAll(key)].map(m => m[1]))].map(name => `server.mjs:${line} logs ${name}`));
}

test('no server.mjs log statement carries sealed Crown payloads', () => {
  const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.ok(logStatements(source).length > 20, 'the scan must see the operator log lines it is meant to check');
  assert.deepEqual(payloadLeaks(source), []);
});

test('the scan catches a payload inside a multi-line log statement', () => {
  const planted = "console.log('HOOK '+JSON.stringify({\n  ok:true,\n  answers:payload.answers\n}));\nconsole.log('SAFE '+JSON.stringify({sealedEvidencePresent:Boolean(s)}));";
  assert.deepEqual(payloadLeaks(planted), ['server.mjs:1 logs answers']);
});
