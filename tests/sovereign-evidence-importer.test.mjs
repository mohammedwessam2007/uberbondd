import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { REQUIRED_SOURCE_CONTRACTS } from '../src/sovereign-bootstrap-readiness.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>readFileSync(path.join(root,rel),'utf8');
const importer=read('ops/sovereign/import-sovereign-evidence.sh');
const installer=read('ops/sovereign/install-authoring-node.sh');
const doctor=read('scripts/sovereign-bootstrap-doctor.mjs');

test('evidence importer shell parses',()=>{
  const out=spawnSync('bash',['-n',path.join(root,'ops/sovereign/import-sovereign-evidence.sh')],{encoding:'utf8'});
  assert.equal(out.status,0,out.stderr);
});

test('importer is root-only and accepts only three fixed evidence classes',()=>{
  assert.match(importer,/\$\{EUID\}.*root-required/);
  assert.match(importer,/signer\) TARGET="\$EVIDENCE_ROOT\/signer-receipt\.json"/);
  assert.match(importer,/courier\) TARGET="\$EVIDENCE_ROOT\/courier-receipt\.json"/);
  assert.match(importer,/runtime\) TARGET="\$EVIDENCE_ROOT\/runtime-receipt\.json"/);
  assert.match(importer,/evidence-type-must-be-signer-courier-or-runtime/);
});

test('receipt symlinks are refused before realpath can erase their identity',()=>{
  const reject=importer.indexOf('regular-nonsymlink-receipt-required');
  const resolve=importer.indexOf('SOURCE_RECEIPT="$(realpath "$SOURCE_RECEIPT")"');
  assert.ok(reject>=0&&resolve>reject,'symlink refusal must occur before receipt realpath');
  const sourceReject=importer.indexOf('exact-installed-git-source-required');
  const sourceResolve=importer.indexOf('SOURCE_ROOT="$(realpath "$SOURCE_ROOT")"');
  assert.ok(sourceReject>=0&&sourceResolve>sourceReject,'source symlink refusal must occur before source realpath');
});

test('importer binds validation to exact clean installed source and trusted source cwd',()=>{
  assert.match(importer,/git -C "\$SOURCE_ROOT" status --porcelain/);
  assert.match(importer,/git -C "\$SOURCE_ROOT" rev-parse HEAD/);
  assert.match(importer,/\^\[0-9a-f\]\{40\}\$/);
  assert.match(importer,/cd "\$SOURCE_ROOT"/);
  assert.match(importer,/compileSovereignBootstrapReadiness/);
  assert.match(importer,/verifySovereignRuntimeRehearsalReceipt/);
});

test('importer stages root-owned read-only evidence before atomic publication',()=>{
  assert.match(importer,/evidence-root-must-be-root-owned/);
  assert.match(importer,/evidence-root-group-must-be-uberbond-autonomy/);
  assert.match(importer,/evidence-root-mode-must-be-0750/);
  assert.match(importer,/install -m 0640 -o root -g uberbond-autonomy/);
  assert.match(importer,/staged-evidence-custody-invalid/);
  assert.match(importer,/mv -f "\$TMP" "\$TARGET"/);
});

test('courier proof depends on the already-admitted exact signer and runtime proof binds exact source',()=>{
  assert.match(importer,/signer-receipt\.json/);
  assert.match(importer,/separateReleaseSignerObserved===true&&out\.stages\.signedReleaseCourierObserved===true/);
  assert.match(importer,/verifySovereignRuntimeRehearsalReceipt\(receipt\).*sourceCommit/s);
});

test('importer grants no transport signing deployment or commercial authority',()=>{
  assert.doesNotMatch(importer,/\bcurl\b|\bwget\b|\bscp\b|\brsync\b|docker\s+|systemctl\s+|PAYPAL_LIVE|release-private\.pem|OUTBOUND_ENABLED=true|AUTOPILOT_ENABLED=true/i);
  assert.match(importer,/"signingAuthority":"NONE"/);
  assert.match(importer,/"deploymentAuthority":"NONE"/);
  assert.match(importer,/"businessEffectAuthority":"NONE"/);
  assert.match(importer,/"externalEffectAuthority":"NONE"/);
});

test('authoring install and doctor make importer part of the canonical bootstrap contract',()=>{
  assert.ok(REQUIRED_SOURCE_CONTRACTS.includes('evidenceImporter'));
  assert.match(doctor,/evidenceImporter:'ops\/sovereign\/import-sovereign-evidence\.sh'/);
  assert.match(installer,/install -d -m 0750 -o root -g uberbond-autonomy \/var\/lib\/uberbond-evidence/);
  assert.match(installer,/import-sovereign-evidence\.sh/);
  assert.match(installer,/UBERBOND_SOVEREIGN_EVIDENCE_ROOT=\/var\/lib\/uberbond-evidence/);
  assert.match(installer,/root-only/);
});
