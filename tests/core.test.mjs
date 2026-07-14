import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRobots,isAllowed} from '../src/robots.mjs';
import {deterministicAudit,scoreProspect,chooseIssue} from '../src/audit-rules.mjs';
import {buildMessage,routeInbox} from '../src/copy.mjs';
import {encryptJson,decryptJson} from '../src/crypto.mjs';
import {parseCsv} from '../src/csv.mjs';
import {isPrivateIp,assertPublicUrl} from '../src/security.mjs';

test('robots longest matching directive wins',()=>{const r=parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/public');assert.equal(isAllowed('https://x.com/private/no',r),false);assert.equal(isAllowed('https://x.com/private/public/a',r),true)});

test('audit detects no CTA and weak contact path',()=>{
  const page={url:'https://x.test',title:'Example Company',description:'',h1Count:1,visibleH1:['Welcome'],headings:[{level:'h1',text:'Welcome'}],ctas:[],controls:[],images:[],forms:[],bodyText:'A company in Cairo',lang:'en',contactSignals:0,mobile:{horizontalOverflow:false,controls:[],document:{width:390},viewport:{width:390}},screenshots:{desktop:'/x.png',mobile:'/m.png'},brokenLinks:[]};
  const a=deterministicAudit({pages:[page],errors:[],emails:[]},{niche:'agency'});
  assert(a.some(x=>x.code==='no-cta'));
  assert(a.some(x=>x.code==='weak-contact-path'));
  assert(a.every(x=>x.evidenceUrl&&x.evidenceExcerpt));
});

test('score creates a valid tier',()=>{const s=scoreProspect({niche:'clinic'},[{severity:5,confidence:.9,service:'Medical communication',safeForOutreach:true}],{email:'a@b.com',personal:true});assert(s.total>=50);assert(['A','B','C','Reject'].includes(s.tier))});
test('chooseIssue rejects unsafe findings',()=>{const x=chooseIssue([{title:'Unsafe',confidence:.99,safeForOutreach:false},{title:'Safe',confidence:.8,safeForOutreach:true}]);assert.equal(x.title,'Safe')});
test('medical prospects route to A',()=>assert.equal(routeInbox({niche:'dental clinic'},[]),'A'));
test('message includes opt out',()=>{const m=buildMessage({prospect:{company:'Clinic',website:'https://clinic.com'},issue:{title:'No obvious booking action',implication:'Patients may not know how to book.',service:'Conversion design',evidenceUrl:'https://clinic.com'},contact:{firstName:'Sara'},sender:{name:'Mohamed',company:'UberBond',address:'Cairo'}});assert.match(m,/[Rr]eply “no”/);assert.match(m,/Hi Sara/)});
test('token encryption round trip',()=>{const key='a'.repeat(64),value={refresh_token:'secret'};assert.deepEqual(decryptJson(encryptJson(value,key),key),value)});
test('CSV parser handles quotes and rows',()=>{const rows=parseCsv('company,website,notes\n"Acme, Inc",https://example.com,"A, B"');assert.equal(rows[0].company,'Acme, Inc');assert.equal(rows[0].notes,'A, B')});
test('private IP detection works',()=>{assert.equal(isPrivateIp('0.1.2.3'),true);assert.equal(isPrivateIp('127.0.0.1'),true);assert.equal(isPrivateIp('192.168.1.2'),true);assert.equal(isPrivateIp('::ffff:127.0.0.1'),true);assert.equal(isPrivateIp('8.8.8.8'),false)});

// SSRF guard: everything below is rejected before any DNS lookup, so this is deterministic offline.
test('assertPublicUrl rejects unsafe targets before resolving DNS',async()=>{
  await assert.rejects(assertPublicUrl('ftp://example.com'),/HTTP and HTTPS/); // scheme-confusion regression
  await assert.rejects(assertPublicUrl('httpx://example.com'),/HTTP and HTTPS/);
  await assert.rejects(assertPublicUrl('https://user:pass@example.com'),/credentials/);
  await assert.rejects(assertPublicUrl('http://localhost'),/Local addresses/);
  await assert.rejects(assertPublicUrl('http://box.local'),/Local addresses/);
  await assert.rejects(assertPublicUrl('http://192.168.0.1'),/Private and reserved/);
  await assert.rejects(assertPublicUrl('http://169.254.169.254/latest/meta-data'),/Private and reserved/);
  await assert.rejects(assertPublicUrl('http://10.1.2.3'),/Private and reserved/);
  const local=await assertPublicUrl('http://127.0.0.1',{allowLocal:true});
  assert.equal(local.hostname,'127.0.0.1');
});
