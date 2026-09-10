import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const installer=readFileSync(new URL('../ops/sovereign/install-offline-llama-runtime.sh',import.meta.url),'utf8');
const unit=readFileSync(new URL('../ops/sovereign/uberbond-offline-llama-runtime.service',import.meta.url),'utf8');

test('direct offline installer refuses artifact symlinks before realpath can erase identity',()=>{
  for(const [input,reason] of [
    ['BINARY_INPUT','llama-server must be a real executable file, not a symlink'],
    ['MODEL_FILE_INPUT','GGUF model must be a real file, not a symlink']
  ]){
    const reject=installer.indexOf(reason);
    const resolve=installer.indexOf(`realpath \"$${input}\"`);
    assert.ok(reject>=0&&resolve>reject,`${input} refusal must precede realpath`);
  }
  assert.match(installer,/Resolved llama-server must remain a real executable file/);
  assert.match(installer,/Resolved GGUF model must remain a real file/);
  const prereq=installer.indexOf('for cmd in sha256sum');
  const firstResolve=installer.indexOf('realpath "$BINARY_INPUT"');
  assert.ok(prereq>=0&&firstResolve>prereq,'realpath prerequisite must be checked before use');
});

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

test('failed candidate admission restores the previous runtime and control configuration',()=>{
  const backup=installer.indexOf('BACKUP_DIR="$(mktemp -d');
  const errorTrap=installer.indexOf('trap rollback ERR');
  const promotion=installer.indexOf('mv -f "$BINARY_STAGE" /opt/uberbond/model-runtime/llama-server');
  const configure=installer.indexOf('/opt/uberbond/control/configure-local-model.sh LLAMA_CPP');
  const successDisarm=installer.lastIndexOf('trap - ERR');
  assert.ok(backup>0&&errorTrap>backup&&promotion>errorTrap&&configure>promotion&&successDisarm>configure);
  assert.match(installer,/previous local runtime\/configuration restored/);
  assert.match(installer,/\$BACKUP_DIR\/llama-server/);
  assert.match(installer,/\$BACKUP_DIR\/model\.gguf/);
  assert.match(installer,/\$BACKUP_DIR\/model\.env/);
  assert.match(installer,/\$BACKUP_DIR\/authoring\.env/);
  assert.match(installer,/PREV_RUNTIME_ACTIVE/);
  assert.match(installer,/PREV_RUNTIME_ENABLED/);
  assert.match(installer,/PREV_PROXY_ACTIVE/);
  assert.match(installer,/PREV_FOUNDER_ACTIVE/);
  assert.match(installer,/PREV_AUTHORING_ACTIVE/);
});

test('offline runtime admission does not gain downstream authority',()=>{
  assert.match(installer,/businessEffectAuthority:'NONE'/);
  assert.match(installer,/externalEffectAuthority:'NONE'/);
  assert.doesNotMatch(installer,/release-private\.pem|\bsign-release\b|git\s+(?:push|merge)\b|paypal\s|stripe\s|customerMessages\s*[:=]\s*[1-9]/i);
});
