import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const bootstrapUrl = new URL('../ops/sovereign/bootstrap-founder-node.sh', import.meta.url);
const script = readFileSync(bootstrapUrl, 'utf8');

test('first boot composes existing sovereign installers instead of creating a second control plane', () => {
  assert.match(script, /install-authoring-node\.sh/);
  assert.match(script, /install-offline-llama-runtime\.sh/);
  assert.match(script, /configure-founder-console-private\.sh/);
  assert.match(script, /uberbond-authorctl doctor/);
  assert.match(script, /uberbond-authorctl wake/);
});

test('first boot source executability contract survives a clean checkout', () => {
  for (const path of [
    bootstrapUrl,
    new URL('../ops/sovereign/install-authoring-node.sh', import.meta.url),
    new URL('../ops/sovereign/install-offline-llama-runtime.sh', import.meta.url)
  ]) {
    assert.notEqual(statSync(path).mode & 0o111, 0, `${path.pathname} must remain executable`);
  }
});

test('first boot refuses source model and llama symlinks before realpath can erase identity', () => {
  for (const [input, refusal] of [
    ['SOURCE_INPUT', 'owner-supplied source must be a real non-symlink Git checkout'],
    ['LLAMA_SERVER_INPUT', 'owner-supplied llama-server must be a real executable file'],
    ['MODEL_FILE_INPUT', 'owner-supplied GGUF model must be a real file']
  ]) {
    const check = script.indexOf(refusal);
    const resolve = script.indexOf(`realpath \"$${input}\"`);
    assert.ok(check >= 0 && resolve > check, `${input} symlink refusal must precede realpath`);
  }
  assert.match(script, /resolved source must remain a real Git checkout/);
  assert.match(script, /resolved llama-server must remain a real executable file/);
  assert.match(script, /resolved GGUF model must remain a real file/);
});

test('first boot creates a root-owned read-only evidence ingress for the founder doctor', () => {
  assert.match(script, /install -d -m 0750 -o root -g uberbond-autonomy \/var\/lib\/uberbond-evidence/);
  assert.match(script, /not writable by the authoring identity/i);
});

test('first boot refuses to claim readiness without the canonical self-completion stages', () => {
  for (const field of [
    'sourceStackComplete',
    'authoringHostInstalled',
    'authoringAutomationActive',
    'directFounderControlReady',
    'localModelAttested',
    'isolatedWorkerReady',
    'directFounderDialogueReady',
    'selfCompletionLoopReady'
  ]) assert.match(script, new RegExp(`stages\\?\\.${field}`));
  assert.match(script, /FOUNDER_FIRST_BOOT_NOT_READY/);
});

test('first boot preserves sovereign dependency and authority boundaries', () => {
  assert.doesNotMatch(script, /\bcurl\b|\bwget\b|apt(-get)?\s+install|npm\s+(install|i)|git\s+clone/i);
  assert.doesNotMatch(script, /OPENAI_API_KEY|ANTHROPIC_API_KEY|VERCEL_TOKEN|GITHUB_TOKEN|release-private\.pem/);
  assert.match(script, /owner-supplied offline llama\.cpp binary \+ GGUF model/i);
  assert.match(script, /no cloud fallback/i);
  assert.match(script, /does not prove[\s\S]*customer\/payment outcomes/i);
});

test('first boot makes iPad/private-LAN access optional and never public by default', () => {
  assert.match(script, /PRIVATE_RFC1918_IPV4/);
  assert.match(script, /CONSOLE_HOST="\$\{PRIVATE_HOST:-127\.0\.0\.1\}"/);
  assert.doesNotMatch(script, /0\.0\.0\.0/);
});
