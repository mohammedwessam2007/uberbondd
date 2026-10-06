import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveChromium } from '../src/resolve-chromium.mjs';

test('resolver honors the repository-local Playwright browser contract', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'uberbond-browser-root-'));
  try {
    const chromium = join(repoRoot, 'node_modules', 'playwright-core', '.local-browsers', 'chromium-1228', 'chrome-linux64', 'chrome');
    mkdirSync(join(chromium, '..'), { recursive: true });
    writeFileSync(chromium, '#!/bin/sh\nexit 0\n');
    chmodSync(chromium, 0o755);
    assert.equal(resolveChromium({}, { repoRoot }), chromium);
    assert.equal(resolveChromium({ PLAYWRIGHT_BROWSERS_PATH: '0' }, { repoRoot }), chromium);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('an explicit non-zero Playwright browser root stays authoritative', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'uberbond-browser-repo-'));
  const configuredRoot = mkdtempSync(join(tmpdir(), 'uberbond-browser-config-'));
  try {
    const local = join(repoRoot, 'node_modules', 'playwright-core', '.local-browsers', 'chromium-local', 'chrome-linux64', 'chrome');
    mkdirSync(join(local, '..'), { recursive: true });
    writeFileSync(local, '#!/bin/sh\nexit 0\n');
    chmodSync(local, 0o755);

    const configured = join(configuredRoot, 'chromium-configured', 'chrome-linux64', 'chrome');
    mkdirSync(join(configured, '..'), { recursive: true });
    writeFileSync(configured, '#!/bin/sh\nexit 0\n');
    chmodSync(configured, 0o755);

    assert.equal(resolveChromium({ PLAYWRIGHT_BROWSERS_PATH: configuredRoot }, { repoRoot }), configured);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(configuredRoot, { recursive: true, force: true });
  }
});
