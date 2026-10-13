#!/usr/bin/env node
// Reviewed-commit guard for the gated Winnr authentication probe.
//
// The probe workflow is activated by a single commit whose parent is the commit a human reviewed (the pin). That
// activation commit may change only the workflow file pair. Everything else must already be the reviewed code. The
// guard refuses on every other shape: a placeholder pin, a multi-commit push, a parent that is not the pin, any extra
// changed file, and any change between the pin and HEAD. It runs inside the protected job, before a secret is exposed.
//
// It is a pure function plus a thin git reader. Only commit identifiers and fixed reason codes are printed.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const WINNR_ACTIVATION_GUARD_VERSION = 'uberbond.winnr-activation-guard.v1';
export const WINNR_PROBE_WORKFLOW_FILE = '.github/workflows/winnr-auth-probe.yml';
export const WINNR_PROBE_GATED_FILE = 'winnr/gated/winnr-auth-probe.github-workflow.yml';
export const WINNR_PROBE_ALLOWED_CHANGES = Object.freeze([WINNR_PROBE_WORKFLOW_FILE, WINNR_PROBE_GATED_FILE]);
export const WINNR_PIN_PLACEHOLDER = 'PLACEHOLDER_PIN_REQUIRED';

const SHA = /^[0-9a-f]{40}$/;

// Pure decision. Inputs are plain strings and arrays, so every refusal can be tested without git.
export function evaluateActivation({
  head = '',
  parent = null,
  pin = '',
  workflowFile = WINNR_PROBE_WORKFLOW_FILE,
  changedFilesHeadVsParent = [],
  codePathsChangedSincePin = []
} = {}) {
  const reasons = [];
  if (!SHA.test(String(pin || ''))) reasons.push('PIN_NOT_SET');
  if (!SHA.test(String(head || ''))) reasons.push('HEAD_NOT_A_COMMIT');
  if (SHA.test(String(pin || '')) && String(head) === String(pin)) reasons.push('NO_ACTIVATION_COMMIT');
  if (!parent || String(parent) !== String(pin)) reasons.push('PARENT_IS_NOT_PIN');
  const changed = [...new Set(changedFilesHeadVsParent.map(String))];
  if (!changed.includes(workflowFile)) reasons.push('ACTIVATION_COMMIT_MISSING_WORKFLOW');
  if (changed.some(file => !WINNR_PROBE_ALLOWED_CHANGES.includes(file))) reasons.push('UNEXPECTED_CHANGED_FILE');
  if (codePathsChangedSincePin.some(file => !WINNR_PROBE_ALLOWED_CHANGES.includes(String(file)))) reasons.push('CODE_CHANGED_SINCE_PIN');
  const unique = [...new Set(reasons)];
  return Object.freeze({
    version: WINNR_ACTIVATION_GUARD_VERSION,
    ok: unique.length === 0,
    reasonCodes: unique,
    head: String(head || ''),
    pin: String(pin || ''),
    changedFileCount: changed.length,
    codeFilesChangedSincePin: codePathsChangedSincePin.length
  });
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// Reads the repository state the pure function needs. Any git failure is recorded as a missing value, so it refuses.
export function readActivationState({ cwd = process.cwd(), pin = '' } = {}) {
  let head = '';
  let parent = null;
  let changedFilesHeadVsParent = [];
  let codePathsChangedSincePin = [];
  try { head = git(['rev-parse', '--verify', 'HEAD'], cwd); } catch { head = ''; }
  try { parent = git(['rev-parse', '--verify', 'HEAD^'], cwd); } catch { parent = null; }
  try {
    if (parent) changedFilesHeadVsParent = git(['diff', '--name-only', 'HEAD^', 'HEAD'], cwd).split('\n').filter(Boolean);
  } catch { changedFilesHeadVsParent = []; }
  try {
    if (SHA.test(String(pin || ''))) codePathsChangedSincePin = git(['diff', '--name-only', pin, 'HEAD'], cwd).split('\n').filter(Boolean);
  } catch {
    // The pin is not present in this clone. Report it as a change so the guard refuses.
    codePathsChangedSincePin = ['PIN_NOT_IN_CLONE'];
  }
  return { head, parent, changedFilesHeadVsParent, codePathsChangedSincePin };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=') || true];
  }));
  const pin = typeof args.pin === 'string' ? args.pin : '';
  const decision = evaluateActivation({ ...readActivationState({ pin }), pin });
  process.stdout.write(`${JSON.stringify(decision)}\n`);
  process.exitCode = decision.ok ? 0 : 3;
}
