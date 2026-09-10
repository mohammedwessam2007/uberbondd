import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('independent verifier can write the exact governance receipt watched by the promoter', () => {
  const verifier = readFileSync(new URL('../scripts/sovereign-autonomy-verify.mjs', import.meta.url), 'utf8');
  const verifierService = readFileSync(new URL('../ops/sovereign/uberbond-autonomy-verify.service', import.meta.url), 'utf8');
  const promotePath = readFileSync(new URL('../ops/sovereign/uberbond-local-promote.path', import.meta.url), 'utf8');
  const installer = readFileSync(new URL('../ops/sovereign/install-authoring-node.sh', import.meta.url), 'utf8');

  assert.match(verifier, /UBERBOND_GOVERNANCE_VERIFIED_PATH/);
  assert.match(verifier, /atomicJson\(governancePath, out, 0o640\)/);
  assert.match(verifierService, /^Environment=UBERBOND_GOVERNANCE_INBOX_ROOT=\/var\/lib\/uberbond-governance\/inbox$/m);
  assert.match(verifierService, /^Environment=UBERBOND_GOVERNANCE_VERIFIED_PATH=\/var\/lib\/uberbond-governance\/inbox\/verified\.json$/m);
  assert.match(verifierService, /^ReadWritePaths=.*\/var\/lib\/uberbond-governance(?:\s|$)/m);
  assert.match(promotePath, /^PathChanged=\/var\/lib\/uberbond-governance\/inbox\/verified\.json$/m);
  assert.match(installer, /install -d -m 2770 -o uberbond-author -g uberbond-promotion \/var\/lib\/uberbond-governance \/var\/lib\/uberbond-governance\/inbox/);
});

test('verifier-to-promoter handoff does not grant signing deployment or business authority', () => {
  const verifier = readFileSync(new URL('../scripts/sovereign-autonomy-verify.mjs', import.meta.url), 'utf8');
  const promoterService = readFileSync(new URL('../ops/sovereign/uberbond-local-promote.service', import.meta.url), 'utf8');
  assert.match(verifier, /signingAuthority:\s*'NONE'/);
  assert.match(verifier, /deploymentAuthority:\s*'NONE'/);
  assert.match(verifier, /businessEffectAuthority:\s*'NONE'/);
  assert.match(promoterService, /^PrivateNetwork=true$/m);
  assert.match(promoterService, /^RestrictAddressFamilies=AF_UNIX$/m);
});
