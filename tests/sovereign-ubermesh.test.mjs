import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const meshUrl=new URL('../ops/sovereign/configure-founder-console-ubermesh.sh',import.meta.url);
const activateUrl=new URL('../ops/sovereign/activate-owned-air-node.sh',import.meta.url);
const mesh=readFileSync(meshUrl,'utf8');
const activate=readFileSync(activateUrl,'utf8');

test('UberMesh entrypoints are executable and shell-valid',()=>{for(const u of [meshUrl,activateUrl]){assert.notEqual(statSync(u).mode&0o111,0);const r=spawnSync('bash',['-n',u.pathname],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}});
test('UberMesh has no centralized mesh/cloud provider dependency',()=>{const s=`${mesh}\n${activate}`;assert.doesNotMatch(s,/tailscale|oracle|digitalocean|azure|aws|gcp|cloudflare|ngrok|zerotier|AI_GATEWAY_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY/i);assert.match(s,/direct WireGuard, no central mesh provider/);});
test('server and iPad use a narrow point-to-point private subnet',()=>{assert.match(mesh,/SERVER_ADDR=10\.77\.0\.1\/30/);assert.match(mesh,/CLIENT_ADDR=10\.77\.0\.2\/32/);assert.match(mesh,/AllowedIPs = \$\{CLIENT_ADDR\}/);assert.match(mesh,/AllowedIPs = \$\{SERVER_IP\}\/32/);assert.doesNotMatch(mesh,/AllowedIPs\s*=\s*0\.0\.0\.0\/0/);});
test('WireGuard keys are generated locally and server key remains root-only',()=>{assert.match(mesh,/wg genkey/);assert.match(mesh,/wg pubkey/);assert.match(mesh,/wg genpsk/);assert.match(mesh,/chmod 0600 "\$SERVER_KEY"/);assert.match(mesh,/install -m 0600 -o root -g root/);});
test('remote console exposure happens only after encrypted interface is active',()=>{const up=mesh.indexOf('systemctl restart "wg-quick@${IFACE}.service"');const bind=mesh.indexOf('"$PRIVATE_CONFIG" "$SERVER_IP"');assert.ok(up>=0&&bind>up);const boot=activate.indexOf('"$BOOTSTRAP" "$ROOT"');const expose=activate.indexOf('"$MESH_CONFIG" "$4"');assert.ok(boot>=0&&expose>boot);});
test('endpoint input is bounded data rather than executable shell',()=>{assert.match(mesh,/\^\[A-Za-z0-9\._:-\]\{1,253\}\$/);assert.match(mesh,/REFUSED: endpoint host contains unsupported characters/);assert.doesNotMatch(mesh,/eval|bash -c|sh -c/);});
test('the generated iPad tunnel routes only to the Communication Center host',()=>{assert.match(mesh,/Communication Center: http:\/\/\$\{SERVER_IP\}:8787\//);assert.match(mesh,/only \$\{SERVER_IP\}\/32 routes through the iPad tunnel/);assert.match(mesh,/PersistentKeepalive = 25/);});
test('network impossibility is surfaced instead of hidden behind provider fallback',()=>{assert.match(mesh,/behind NAT\/CGNAT/);assert.match(mesh,/Software cannot manufacture an inbound Internet route/);assert.doesNotMatch(mesh,/(^|\n)\s*(?:tailscale\s+funnel|ngrok|cloudflared)\b|relay\.tailscale|cloud fallback/i);});
