import test from 'node:test';
import assert from 'node:assert/strict';
import { extractInquirySurface } from '../src/inquiry-path-coherence.mjs';
import { normalizeDeclaration, reconcileDeclaredNumbers, renderDeclaredNumberReport } from '../src/declared-number-reconciliation.mjs';

const page = (url, body, head = '') => extractInquirySurface({ url, status: 200, html: `<html><head><title>Acme Plumbing</title>${head}</head><body><p>Acme Plumbing serves the whole county with licensed plumbers, water heaters, drain cleaning and emergency repair, every day of the week.</p>${body}</body></html>` });

test('declarations normalize and reject unusable numbers; an empty declaration is refused', () => {
  const d = normalizeDeclaration([{ number: '(512) 555-2671', purpose: 'main' }, { number: '+1 512 555 2672' }, { number: '12345' }]);
  assert.deepEqual([...d.numbers.keys()], ['5125552671', '5125552672']);
  assert.equal(d.rejected[0].reason, 'TOO_FEW_DIGITS');
  assert.throws(() => reconcileDeclaredNumbers({ pages: [], declared: [{ number: 'abc' }] }), /at least one valid/);
});

test('a clean site produces a verified routing record, not an empty report', () => {
  const pages = [page('https://acme.example/', '<a href="tel:5125552671">Call (512) 555-2671</a>')];
  const result = reconcileDeclaredNumbers({ pages, declared: [{ number: '512-555-2671', purpose: 'main line' }] });
  assert.equal(result.verdict, 'CLEAN');
  assert.deepEqual(result.coverage, [{ url: 'https://acme.example/', label: 'Call (512) 555-2671', dials: '(512) 555-2671', reaches: 'main line' }]);
});

test('an undeclared tap target is verified against the declaration; repeated footers merge', () => {
  const footer = '<a href="tel:5125550199">Call (512) 555-2671</a>';
  const pages = [page('https://acme.example/', footer), page('https://acme.example/contact', footer)];
  const result = reconcileDeclaredNumbers({ pages, declared: [{ number: '5125552671', purpose: 'main line' }] });
  const dials = result.findings.filter(f => f.code === 'DIALS_UNDECLARED_NUMBER');
  assert.equal(dials.length, 1);
  assert.equal(dials[0].status, 'VERIFIED_AGAINST_DECLARATION');
  assert.equal(dials[0].pagesAffected, 2);
  assert.equal(result.verdict, 'FINDINGS');
});

test('call tracking downgrades a tap finding to needs-confirmation with a caveat', () => {
  const pages = [page('https://acme.example/', '<a href="tel:5125550199">Call us</a>', '<script src="https://cdn.callrail.com/companies/1/swap.js"></script>')];
  const [finding] = reconcileDeclaredNumbers({ pages, declared: [{ number: '5125552671' }] }).findings;
  assert.equal(finding.status, 'NEEDS_CONFIRMATION');
  assert.match(finding.caveat, /tracking pool/);
});

test('undeclared printed and schema numbers, absent declared numbers and unreadable pages are all reported', () => {
  const schema = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Plumber","name":"Acme","telephone":"512-555-0142"}</script>';
  const pages = [
    page('https://acme.example/', '<p>Office: (512) 555-2177</p><a href="tel:5125552671">Call (512) 555-2671</a>', schema),
    { url: 'https://acme.example/book', sourceSha256: 'x', observability: 'BOT_CHALLENGE_OR_INTERSTITIAL' },
  ];
  const result = reconcileDeclaredNumbers({ pages, declared: [{ number: '5125552671', purpose: 'main' }, { number: '5125552999', purpose: 'after hours' }] });
  const codes = result.findings.map(f => f.code).sort();
  assert.deepEqual(codes, ['SCHEMA_UNDECLARED_NUMBER', 'SHOWS_UNDECLARED_NUMBER']);
  assert.deepEqual(result.declaredButNotFound, [{ number: '(512) 555-2999', purpose: 'after hours' }]);
  assert.deepEqual(result.unobservable, [{ url: 'https://acme.example/book', observability: 'BOT_CHALLENGE_OR_INTERSTITIAL' }]);
  assert.equal(reconcileDeclaredNumbers({ pages: [pages[1]], declared: [{ number: '5125552671' }] }).verdict, 'NOT_OBSERVABLE');
});

test('the report escapes page-controlled text and states its scope', () => {
  const pages = [page('https://acme.example/', '<a href="tel:5125550199">Call <img src=x onerror=alert(1)> now | x</a>')];
  const report = renderDeclaredNumberReport(reconcileDeclaredNumbers({ pages, declared: [{ number: '5125552671' }] }), { site: 'acme.example', checkedAt: '2026-10-23T00:00:00Z' });
  assert.doesNotMatch(report, /<img/);
  assert.match(report, /not an estimate of lost revenue/);
  assert.match(report, /Verified against your declaration/);
});

test('only path-defect codes from the standard check are carried into the report', () => {
  const pages = [page('https://acme.example/', '<a href="tel:5125552671">Call (512) 555-2671</a>')];
  const result = reconcileDeclaredNumbers({ pages, declared: [{ number: '5125552671' }] });
  const report = renderDeclaredNumberReport(result, { site: 'acme.example', checkedAt: 't', pathDefects: [
    { code: 'TEL_LINK_MALFORMED', title: '1 call link cannot dial', why: 'w', thirtySecondDisproof: 'd' },
    { code: 'TEL_LABEL_DIALS_DIFFERENT_NUMBER', title: 'superseded by the declaration', why: 'w', thirtySecondDisproof: 'd' },
  ] });
  assert.match(report, /## Other path defects[\s\S]*1 call link cannot dial/);
  assert.doesNotMatch(report, /superseded by the declaration/);
});

test('an unreadable site never reads as clean in the report', () => {
  const result = reconcileDeclaredNumbers({ pages: [{ url: 'https://acme.example/', sourceSha256: 'x', observability: 'NO_STATIC_CONTENT' }], declared: [{ number: '5125552671' }] });
  const report = renderDeclaredNumberReport(result, { site: 'acme.example', checkedAt: 't' });
  assert.match(report, /nothing was verified\. This is not a clean result/);
  assert.doesNotMatch(report, /matches your declaration/);
});

test('a declared number that is printed but only behind a malformed link is reported as not tappable, not as absent', () => {
  const pages = [page('https://acme.example/contact', '<p>Licensed. Emergency: (512) 555-2477</p><a href="tel:tel:512-555-2477">Emergency line</a><a href="tel:5125552671">Call (512) 555-2671</a>')];
  const result = reconcileDeclaredNumbers({ pages, declared: [{ number: '5125552671', purpose: 'main line' }, { number: '5125552477', purpose: 'emergency line' }] });
  assert.deepEqual(result.declaredButNotFound, [], 'printed counts as found even when the extractor labels it regulatory');
  const [finding] = result.findings.filter(f => f.code === 'DECLARED_NUMBER_NOT_TAPPABLE');
  assert.match(finding.title, /emergency line \(512\) 555-2477 is printed, but no working call link/);
  assert.equal(result.findings.filter(f => f.code === 'DECLARED_NUMBER_NOT_TAPPABLE').length, 1, 'the tappable main line is not reported');
});
