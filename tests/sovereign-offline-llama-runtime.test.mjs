import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const installer=readFileSync(new URL('../ops/sovereign/install-offline-llama-runtime.sh',import.meta.url),'utf8');
const unit=readFileSync(new URL('../ops/sovereign/uberbond-offline-llama-runtime.service',import.meta.url),'utf8');

test('offline llama seed never downloads a runtime or model',()=>{
  assert.doesNotMatch(installer,/\b(?:curl|wget)\b|git\s+clone|huggingface|hf_hub|apt(?:-get)?\s+install|dnf\s+install|yum\s+install|npm\s+install/i);
  assert.doesNotMatch(installer,/https?:\/\/(?!127\.0\.0\.1)/i);
  assert.match(installer,/networkSeedCalls:0/);
  assert.match(installer,/cloudProviderCalls:0/);
});

test('offline seed binds both supplied artifacts cryptographically before admission',()=>{
  assert.match(installer,/head -c 4 "\$MODEL_FILE"/);
  assert.match(installer,/== "GGUF"/);
  assert.match(installer,/BINARY_SHA="\$\(sha256sum/);
  assert.match(installer,/MODEL_SHA="\$\(sha256sum/);
  assert.match(installer,/Installed llama-server checksum mismatch/);
  assert.match(installer,/Installed GGUF checksum mismatch/);
  assert.match(installer,/modelSha256:process\.env\.MODEL_SHA/);
  assert.match(installer,/binarySha256:process\.env\.BINARY_SHA/);
});

test('llama runtime is a dedicated localhost-only no-public-network service',()=>{
  assert.match(unit,/User=uberbond-local-model/);
  assert.match(unit,/Group=uberbond-model/);
  assert.match(unit,/--alias \$\{UBERBOND_LOCAL_MODEL_ID\}/);
  assert.match(unit,/--host 127\.0\.0\.1 --port 11439/);
  assert.match(unit,/IPAddressDeny=any/);
  assert.match(unit,/IPAddressAllow=localhost/);
  assert.doesNotMatch(unit,/0\.0\.0\.0/);
  assert.match(unit,/NoNewPrivileges=true/);
  assert.match(unit,/ProtectSystem=strict/);
});

test('worker is enabled only after live API model identity attestation',()=>{
  const attestation=installer.indexOf("fetch('http://127.0.0.1:11439/v1/models'");
  const identity=installer.indexOf("payload?.data?.[0]?.id!==expected");
  const configure=installer.indexOf('/opt/uberbond/control/configure-local-model.sh LLAMA_CPP');
  assert.ok(attestation>0&&identity>attestation&&configure>identity);
  assert.match(installer,/Offline llama runtime did not attest the configured model alias before timeout/);
});

test('offline runtime admission does not gain downstream authority',()=>{
  assert.match(installer,/businessEffectAuthority:'NONE'/);
  assert.match(installer,/externalEffectAuthority:'NONE'/);
  assert.doesNotMatch(installer,/release-private\.pem|sign-release|git\s+push|git\s+merge|payment|customerMessages/i);
});
