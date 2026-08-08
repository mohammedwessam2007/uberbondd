import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOmniaV9Mode, isOmniaV9Active, isOmniaV9CompareMode, OMNIA_V9_DEFAULT_MODE } from '../src/omnia-v9/integrations/config.mjs';

test('OMNIA_V9_MODE default is off', () => {
  assert.equal(resolveOmniaV9Mode({}), 'off');
  assert.equal(OMNIA_V9_DEFAULT_MODE, 'off');
});

test('OMNIA_V9_MODE accepts off, shadow, compare', () => {
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'off' }), 'off');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'shadow' }), 'shadow');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'compare' }), 'compare');
});

test('OMNIA_V9_MODE is case-insensitive and trims whitespace', () => {
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: '  SHADOW  ' }), 'shadow');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'Compare' }), 'compare');
});

test('unknown mode values resolve to off, never to an enforcing state', () => {
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'enforce' }), 'off');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'canary' }), 'off');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'ENFORCE_ELIGIBLE' }), 'off');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'true' }), 'off');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: '1' }), 'off');
});

test('malformed mode values (empty, null, whitespace-only) resolve to off', () => {
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: '' }), 'off');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: null }), 'off');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: undefined }), 'off');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: '   ' }), 'off');
  assert.equal(resolveOmniaV9Mode(undefined), 'off');
});

test('isOmniaV9Active is true only for shadow and compare', () => {
  assert.equal(isOmniaV9Active('off'), false);
  assert.equal(isOmniaV9Active('shadow'), true);
  assert.equal(isOmniaV9Active('compare'), true);
  assert.equal(isOmniaV9Active('enforce'), false);
  assert.equal(isOmniaV9Active(undefined), false);
});

test('isOmniaV9CompareMode is true only for compare', () => {
  assert.equal(isOmniaV9CompareMode('compare'), true);
  assert.equal(isOmniaV9CompareMode('shadow'), false);
  assert.equal(isOmniaV9CompareMode('off'), false);
});
