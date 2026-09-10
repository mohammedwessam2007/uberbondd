import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyFounderPrivateHost, compileFounderPrivateGatewayBinding, founderGatewayAuthorized } from '../src/sovereign-founder-private-gateway.mjs';

const token='0123456789abcdefghijklmnopqrstuvwxyzABCDEFG';

test('private founder gateway admits only loopback or private/tunnel address classes', () => {
  for(const host of ['10.2.3.4','172.16.1.2','172.31.9.9','192.168.1.50']) assert.equal(classifyFounderPrivateHost(host),'RFC1918');
  assert.equal(classifyFounderPrivateHost('100.64.2.3'),'CGNAT_PRIVATE_TUNNEL');
  assert.equal(classifyFounderPrivateHost('100.127.255.254'),'CGNAT_PRIVATE_TUNNEL');
  assert.equal(classifyFounderPrivateHost('fd12:3456::8'),'IPV6_ULA');
  for(const host of ['0.0.0.0','::','8.8.8.8','1.1.1.1','example.com']) assert.equal(compileFounderPrivateGatewayBinding({host,token}).ok,false,host);
});

test('private founder gateway requires a strong secret and accepts browser Basic or API Bearer auth', () => {
  assert.equal(compileFounderPrivateGatewayBinding({host:'192.168.1.2',token:'short'}).ok,false);
  assert.equal(compileFounderPrivateGatewayBinding({host:'192.168.1.2',token}).ok,true);
  const basic='Basic '+Buffer.from(`founder:${token}`).toString('base64');
  assert.equal(founderGatewayAuthorized(token,basic),true);
  assert.equal(founderGatewayAuthorized(token,`Bearer ${token}`),true);
  assert.equal(founderGatewayAuthorized(token,'Basic '+Buffer.from(`attacker:${token}`).toString('base64')),false);
  assert.equal(founderGatewayAuthorized(token,'Bearer wrong'),false);
});

test('gateway process can only proxy the fixed loopback founder console surface', () => {
  const source=readFileSync(new URL('../scripts/sovereign-founder-private-gateway.mjs',import.meta.url),'utf8');
  assert.match(source,/const UPSTREAM_HOST='127\.0\.0\.1'/);
  assert.match(source,/const UPSTREAM_PORT=8787/);
  assert.match(source,/new Set\(\['\/','\/api\/status','\/api\/command'\]\)/);
  assert.match(source,/origin:`http:\/\/\$\{UPSTREAM_HOST\}:\$\{UPSTREAM_PORT\}`/);
  assert.match(source,/www-authenticate/);
  assert.doesNotMatch(source,/https:\/\//);
  assert.doesNotMatch(source,/fetch\s*\(/);
});

test('systemd sandbox denies public IP traffic even after process compromise', () => {
  const unit=readFileSync(new URL('../ops/sovereign/uberbond-founder-private-gateway.service',import.meta.url),'utf8');
  assert.match(unit,/IPAddressDeny=any/);
  for(const allowed of ['localhost','10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','100.64.0.0/10','fc00::/7']) assert.ok(unit.includes(`IPAddressAllow=${allowed}`),allowed);
  assert.match(unit,/NoNewPrivileges=true/);
  assert.match(unit,/ProtectSystem=strict/);
});

test('activation generates the founder secret locally and never opens firewall or cloud provider surfaces', () => {
  const installer=readFileSync(new URL('../ops/sovereign/configure-founder-private-gateway.sh',import.meta.url),'utf8');
  assert.match(installer,/randomBytes\(32\)/);
  assert.match(installer,/chmod 0640 \/etc\/uberbond\/founder-private-gateway\.env/);
  assert.match(installer,/hostClass==='LOOPBACK'/);
  assert.doesNotMatch(installer,/\b(?:ufw|iptables|nft|firewall-cmd)\b/);
  assert.doesNotMatch(installer,/vercel|openai|anthropic|cloudflare/i);
});
