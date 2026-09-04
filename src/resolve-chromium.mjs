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
import { join } from 'node:path';

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
export function resolveChromium(env = process.env) {
  const declared = String(env.CHROMIUM_PATH || '').trim();
  if (declared) return isExecutableFile(declared) ? declared : '';

  // Playwright installs land as <root>/chromium-<build>/chrome-linux/chrome.
  // Full builds are preferred over headless shells: the shell is enough for the
  // crawler, but where both exist the one the crawler was written against wins.
  //
  // A declared install root is the declared install root. Also falling back to
  // the conventional one would mean an operator who points this somewhere
  // deliberately still gets whatever happens to be in /opt, which is the same
  // class of mistake as ignoring CHROMIUM_PATH.
  const root = String(env.PLAYWRIGHT_BROWSERS_PATH || '').trim() || '/opt/pw-browsers';
  let entries = [];
  try { entries = readdirSync(root); } catch { entries = []; }

  const chromeBuilds = [];
  const headlessShells = [];
  for (const entry of entries.filter(name => name.startsWith('chromium')).sort()) {
    chromeBuilds.push(join(root, entry, 'chrome-linux', 'chrome'));
    headlessShells.push(join(root, entry, 'chrome-linux', 'headless_shell'));
  }

  return [
    ...chromeBuilds,
    ...headlessShells,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome'
  ].find(isExecutableFile) || '';
}
