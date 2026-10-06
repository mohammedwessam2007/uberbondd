// Where the browser is, when nobody said.
//
// `CHROMIUM_PATH` is how every consumer in this repository finds Chromium, and
// nothing sets it by default. The mutation war read that variable and nothing
// else, so on a machine with Chromium sitting on disk it reported
// SKIPPED_NEEDS_BROWSER for a guard it could have exercised -- and in a summary
// line, a skip that could not be helped looks exactly like a skip that could.
//
// This lives in its own file because the alternative was a helper inside the
// mutation registry mutating itself: the registry stores its anchors as literal
// source strings, so a mutation of a function in that same file matches its own
// registration and resolves to two sites instead of one.
import { readdirSync, statSync, accessSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const isExecutableFile = candidate => {
  try {
    accessSync(candidate, constants.X_OK);
    return statSync(candidate).isFile();
  } catch { return false; }
};

/**
 * The Chromium this repository would drive, or '' if there is none.
 *
 * Looks only at paths that exist and are executable, and returns '' rather than
 * a guess when nothing is found. Inventing a path would turn an honest
 * SKIPPED_NEEDS_BROWSER into a verdict nobody measured, which is the failure the
 * mutation war exists to prevent rather than commit.
 *
 * An explicitly declared CHROMIUM_PATH is authoritative and is still checked: a
 * variable pointing at nothing is a misconfiguration, and reading it as proof of
 * a browser would report a skip as a kill.
 */
export function resolveChromium(env = process.env, { repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const declared = String(env.CHROMIUM_PATH || '').trim();
  if (declared) return isExecutableFile(declared) ? declared : '';

  // package.json installs Playwright with PLAYWRIGHT_BROWSERS_PATH=0, which
  // stores Chromium inside node_modules/playwright-core/.local-browsers. Search
  // that exact repository-local contract before host-specific cache locations.
  // A non-zero PLAYWRIGHT_BROWSERS_PATH remains authoritative.
  const repoLocalRoot = join(repoRoot, 'node_modules', 'playwright-core', '.local-browsers');
  const configuredRoot = String(env.PLAYWRIGHT_BROWSERS_PATH || '').trim();
  const roots = configuredRoot
    ? [configuredRoot === '0' ? repoLocalRoot : configuredRoot]
    : [repoLocalRoot, '/opt/pw-browsers', '/opt/render/.cache/ms-playwright', '/ms-playwright'];

  const chromeBuilds = [];
  const headlessShells = [];
  for (const root of roots) {
    let entries = [];
    try { entries = readdirSync(root); } catch { continue; }
    for (const entry of entries.filter(name => name.startsWith('chromium')).sort()) {
      const base = join(root, entry);
      // Playwright's current Chrome-for-Testing layout.
      chromeBuilds.push(
        join(base, 'chrome-linux64', 'chrome'),
        join(base, 'chrome-linux', 'chrome')
      );
      // Older/full and headless-shell layouts.
      headlessShells.push(
        join(base, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
        join(base, 'chrome-headless-shell-linux64', 'headless_shell'),
        join(base, 'chrome-linux', 'headless_shell')
      );
    }
  }

  return [
    ...chromeBuilds,
    ...headlessShells,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome'
  ].find(isExecutableFile) || '';
}
