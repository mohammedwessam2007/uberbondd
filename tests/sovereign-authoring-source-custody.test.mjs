import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const installerUrl=new URL('../ops/sovereign/install-authoring-node.sh',import.meta.url);
const installer=readFileSync(installerUrl,'utf8');

test('authoring installer shell parses after source-custody hardening',()=>{
  const out=spawnSync('bash',['-n',installerUrl.pathname],{encoding:'utf8'});
  assert.equal(out.status,0,out.stderr);
});

test('incoming checkout symlink is refused before realpath can erase caller-visible identity',()=>{
  const reject=installer.indexOf('real non-symlink Git checkout is required');
  const resolve=installer.indexOf('SOURCE="$(realpath "$SOURCE")"');
  assert.ok(reject>=0&&resolve>reject,'source symlink refusal must precede source realpath');
  assert.match(installer,/Resolved source identity changed/);
});

test('incoming Git truth executes as the actual source owner rather than root',()=>{
  assert.match(installer,/SOURCE_OWNER="\$\(stat -c %U "\$SOURCE"\)"/);
  assert.match(installer,/getent passwd "\$SOURCE_OWNER"/);
  assert.match(installer,/git_as_source_owner\(\).*runuser -u "\$SOURCE_OWNER"/s);
  assert.match(installer,/git_as_source_owner "\$SOURCE" status --porcelain/);
  assert.match(installer,/git_as_source_owner "\$SOURCE" rev-parse HEAD/);
  assert.doesNotMatch(installer,/\bgit -C "\$SOURCE"/);
});

test('archived stage is verified before and after transfer to promoter custody',()=>{
  assert.match(installer,/stat -c %U "\$STAGE".*SOURCE_OWNER/s);
  assert.match(installer,/git_as_source_owner "\$STAGE" rev-parse HEAD/);
  assert.match(installer,/git_as_source_owner "\$STAGE" status --porcelain/);
  const chown=installer.indexOf('chown -R uberbond-promoter:uberbond-autonomy "$STAGE"');
  const promoterCheck=installer.indexOf('git_as_promoter "$STAGE" rev-parse HEAD');
  assert.ok(chown>=0&&promoterCheck>chown,'promoter verification must happen after custody transfer');
});

test('installed trusted source is verified as promoter owner, closing Git dubious-ownership failure',()=>{
  assert.match(installer,/git_as_promoter\(\).*runuser -u uberbond-promoter/s);
  assert.match(installer,/git_as_promoter \/opt\/uberbond\/source rev-parse HEAD/);
  assert.match(installer,/git_as_promoter \/opt\/uberbond\/source status --porcelain/);
  assert.doesNotMatch(installer,/\bgit -C \/opt\/uberbond\/source/);
});

test('Git verification suppresses ambient global/system config and filesystem monitor execution',()=>{
  assert.match(installer,/GIT_CONFIG_GLOBAL=\/dev\/null/);
  assert.match(installer,/GIT_CONFIG_SYSTEM=\/dev\/null/);
  assert.match(installer,/-c core\.fsmonitor=false/);
});

test('trusted source is promoter writable and autonomy readable without introducing group/world write',()=>{
  assert.match(installer,/chown -R uberbond-promoter:uberbond-autonomy "\$STAGE"/);
  assert.match(installer,/chmod -R u\+rwX,g\+rX,g-w,o-rwx "\$STAGE"/);
  assert.doesNotMatch(installer,/chmod -R[^\n]*g\+w/);
});

test('authoring and promotion configs inherit the same resolved trusted Git executable',()=>{
  assert.match(installer,/GIT="\$\(realpath "\$\(command -v git\)"\)"/);
  const matches=installer.match(/UBERBOND_GIT_EXECUTABLE=\$GIT/g)||[];
  assert.equal(matches.length,2);
});
