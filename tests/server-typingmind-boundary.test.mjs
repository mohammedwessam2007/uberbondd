import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');

test('TypingMind response helpers never leak into unrelated server brokers',()=>{
  const boundary=source.indexOf('function typingMindCors(req)');
  assert.ok(boundary>0,'TypingMind helper boundary must exist');
  const before=source.slice(0,boundary);
  assert.equal(before.includes('sendTypingMindJson('),false,'unrelated pre-TypingMind broker references sendTypingMindJson');
  assert.equal(before.includes('sendTypingMindStream('),false,'unrelated pre-TypingMind broker references sendTypingMindStream');
});

test('UberMail bootstrap malformed JSON stays on ordinary server response contract',()=>{
  const match=source.match(/async function brokerUberMailBootstrap[\s\S]*?async function brokerUberMail\(/);
  assert.ok(match,'UberMail bootstrap broker source must be present');
  assert.match(match[0],/catch \(error\) \{ return sendJson\(res, 400,/);
  assert.doesNotMatch(match[0],/sendTypingMind(?:Json|Stream)\(/);
});

test('TypingMind helpers remain confined to the TypingMind gateway region',()=>{
  const start=source.indexOf('function typingMindCors(req)');
  const end=source.indexOf('async function brokerInfiniteOpus(',start);
  assert.ok(start>=0&&end>start,'TypingMind gateway region must be bounded');
  const region=source.slice(start,end);
  assert.match(region,/function sendTypingMindJson\(/);
  assert.match(region,/function sendTypingMindStream\(/);
  assert.match(region,/async function brokerTypingMindInfiniteOpus\(/);
});
