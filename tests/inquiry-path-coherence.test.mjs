import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractInquirySurface, analyzeInquiryCoherence, compileCoherenceSnapshot,
  normalizeTelHref, phonesInText, schemaDeclaresAlwaysOpen, decodeEntities
} from '../src/inquiry-path-coherence.mjs';
import { probeInquiryPath, robotsDisallows, inquiryLinks } from '../src/inquiry-path-probe.mjs';

const page = (html, url = 'https://plumber.example/') => extractInquirySurface({ url, html, status: 200 });
const codes = analysis => analysis.findings.map(item => item.code);

test('tel href normalisation accepts NANP forms and names every refusal', () => {
  assert.deepEqual(normalizeTelHref('tel:+1-512-867-5309'), { ok: true, key: '5128675309' });
  assert.deepEqual(normalizeTelHref('tel:(512)%20867-5309'), { ok: true, key: '5128675309' });
  assert.equal(normalizeTelHref('tel:512-867-530').reason, 'TOO_FEW_DIGITS');
  assert.equal(normalizeTelHref('tel:1-800-FLOWERS').reason, 'LETTERS_IN_TEL_HREF');
  assert.equal(normalizeTelHref('tel:+966 11 234 5678').reason, 'NON_NANP_NOT_ANALYZED');
  assert.equal(normalizeTelHref('tel:123-456-7890').reason, 'INVALID_NANP_DIGITS');
});

test('phone extraction ignores prices, dates, zip codes and order numbers', () => {
  const text = 'Save $1,299.00 on 2026-10-21. Zip 78701. Order 4155551234567. Call (512) 867-5309 or 737.555.0142 today';
  assert.deepEqual(phonesInText(text).map(phone => phone.key), ['5128675309', '7375550142']);
  assert.equal(phonesInText('7375550142')[0], undefined, 'bare digit run without a separator is not trusted as a phone');
  assert.equal(phonesInText('(512) 555-0123')[0].fictional, true);
});

test('a call button that prints one number and dials another is an assertable contradiction', () => {
  const analysis = analyzeInquiryCoherence({ pages: [page(`
    <header><a class="btn" href="tel:5124441111">Call (512) 867-5309</a></header>
    <footer><p>Call us: (512) 867-5309</p></footer>`)] });
  const hit = analysis.findings.find(item => item.code === 'TEL_LABEL_DIALS_DIFFERENT_NUMBER');
  assert.ok(hit);
  assert.equal(hit.class, 'CONTRADICTION');
  assert.equal(hit.firstTouchUse, 'MAY_STATE_AS_OBSERVED_FACT');
  assert.match(hit.title, /\(512\) 867-5309.*dials \(512\) 444-1111/);
  assert.match(hit.thirtySecondDisproof, /tap the "Call \(512\) 867-5309" control/);
  assert.equal(hit.evidence[0].sourceSha256.length, 64);
  assert.equal(analysis.verdict, 'ASSERTABLE_DEFECT_OBSERVED');
});

test('call-tracking scripts downgrade a mismatch to a question instead of a claim', () => {
  const analysis = analyzeInquiryCoherence({ pages: [page(`
    <script src="https://cdn.callrail.com/companies/1/abc/12/swap.js"></script>
    <a href="tel:5124441111">Call (512) 867-5309</a>`)] });
  const hit = analysis.findings.find(item => item.code === 'TEL_LABEL_DIALS_DIFFERENT_NUMBER');
  assert.equal(hit.firstTouchUse, 'ASK_DONT_ASSERT');
  assert.match(hit.runtimeCaveat, /CallRail/);
  assert.ok(hit.confidence < 0.85);
  assert.equal(analysis.verdict, 'QUESTION_WORTH_ASKING');
});

test('a matching button, schema and footer produce no incoherence', () => {
  const analysis = analyzeInquiryCoherence({ pages: [page(`
    <script type="application/ld+json">{"@type":"Plumber","name":"Ace","telephone":"+1-512-867-5309"}</script>
    <a href="tel:+15128675309">(512) 867-5309</a><p>Call (512) 867-5309</p>`)] });
  assert.deepEqual(analysis.findings, []);
  assert.equal(analysis.verdict, 'NO_INCOHERENCE_OBSERVED');
});

test('malformed tel links, untappable numbers and unparseable schema are each named', () => {
  const malformed = analyzeInquiryCoherence({ pages: [page('<a href="tel:512-867-530">Call now</a><p>(512) 867-5309</p>')] });
  assert.ok(codes(malformed).includes('TEL_LINK_MALFORMED'));
  const untappable = analyzeInquiryCoherence({ pages: [page('<p>Emergency? Call (512) 867-5309</p>')] });
  assert.ok(codes(untappable).includes('PHONE_SHOWN_BUT_NOT_TAPPABLE'));
  const broken = analyzeInquiryCoherence({ pages: [page('<script type="application/ld+json">{"@type":"Plumber",}</script>')] });
  assert.ok(codes(broken).includes('STRUCTURED_DATA_UNPARSEABLE'));
});

test('fictional 555-01xx numbers never become evidence about a real business', () => {
  const analysis = analyzeInquiryCoherence({ pages: [page('<p>Example: (512) 555-0123</p>')] });
  assert.deepEqual(analysis.findings, []);
});

test('schema phone that visitors never see is a machine-facing contradiction', () => {
  const analysis = analyzeInquiryCoherence({ pages: [page(`
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"HVACBusiness","name":"Cool Co","telephone":"(737) 222-3333"}]}</script>
    <a href="tel:5128675309">(512) 867-5309</a>`)] });
  const hit = analysis.findings.find(item => item.code === 'MACHINE_READABLE_PHONE_DIVERGES');
  assert.ok(hit);
  assert.match(hit.title, /\(737\) 222-3333/);
  assert.match(hit.evidence[0].excerpt, /HVACBusiness "Cool Co"/);
});

test('always-open claim against limited declared hours is asked, never asserted', () => {
  assert.equal(schemaDeclaresAlwaysOpen([{ openingHours: 'Mo-Su 00:00-23:59' }]), true);
  assert.equal(schemaDeclaresAlwaysOpen([{ openingHours: ['Mo-Fr 08:00-17:00'] }]), false);
  assert.equal(schemaDeclaresAlwaysOpen([{ openingHoursSpecification: [{ dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day => `https://schema.org/${day}`), opens: '00:00', closes: '23:59' }] }]), true);
  assert.equal(schemaDeclaresAlwaysOpen([{ name: 'x' }]), null);
  const analysis = analyzeInquiryCoherence({ pages: [page(`
    <script type="application/ld+json">{"@type":"Plumber","telephone":"5128675309","openingHours":"Mo-Fr 08:00-17:00"}</script>
    <h2>24/7 Emergency Plumbing</h2><a href="tel:5128675309">(512) 867-5309</a>`)] });
  const hit = analysis.findings.find(item => item.code === 'ALWAYS_OPEN_CLAIM_VS_DECLARED_HOURS');
  assert.equal(hit.firstTouchUse, 'ASK_DONT_ASSERT');
});

test('forms: dead action host is broken, heavy form is only an observation, search boxes are ignored', () => {
  const surface = page(`
    <form method="post" action="https://forms.dead-vendor.example/submit"><input name="n" required><input name="e" required></form>
    <form action="/search"><input name="s" type="search"></form>
    <form method="post">${Array.from({ length: 8 }, (_, i) => `<input name="f${i}" required>`).join('')}<div class="g-recaptcha"></div></form>`);
  assert.equal(surface.forms[1].looksLikeSearch, true);
  assert.equal(surface.forms[2].hasCaptcha, true);
  const analysis = analyzeInquiryCoherence({ pages: [surface], hostResolution: { 'forms.dead-vendor.example': 'NXDOMAIN' } });
  assert.equal(analysis.findings.find(item => item.code === 'FORM_SUBMITS_TO_NONEXISTENT_HOST').class, 'MALFORMATION');
  assert.equal(analysis.findings.find(item => item.code === 'HIGH_FRICTION_INQUIRY_FORM').firstTouchUse, 'ASK_DONT_ASSERT');
  assert.equal(analysis.surface.formCount, 2);
});

test('lead-stack fingerprints and hidden-text exclusion', () => {
  const surface = page(`<script src="https://static.housecallpro.com/x.js"></script>
    <script>var phone="(512) 444-1111";</script><style>.x{}</style><!-- (512) 444-2222 -->
    <p>${decodeEntities('Call&nbsp;(512)&#32;867-5309')}</p>`);
  assert.deepEqual(surface.leadStack, ['Housecall Pro']);
  assert.deepEqual(surface.visiblePhones.map(phone => phone.key), ['5128675309']);
});

test('non-2xx pages are excluded from evidence, snapshot never invents findings', () => {
  const missing = extractInquirySurface({ url: 'https://x.example/contact', html: '<a href="tel:1">x</a>', status: 404 });
  const analysis = analyzeInquiryCoherence({ pages: [missing], business: { name: 'X' } });
  assert.equal(analysis.pagesAnalyzed, 0);
  assert.equal(analysis.pagesRejected, 1);
  const markdown = compileCoherenceSnapshot({ analysis, observedAt: '2026-10-21T00:00:00Z' });
  assert.equal(analysis.verdict, 'NOT_OBSERVABLE_FROM_STATIC_HTML', 'zero readable pages is not a clean bill of health');
  assert.match(markdown, /Not observable/);
  assert.doesNotMatch(markdown, /real result/);
  assert.doesNotMatch(markdown, /\$\d/);
  assert.equal(analysis.businessEffectAuthority, 'NONE');
});

test('robots rules and inquiry link discovery', () => {
  const robots = 'User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private\nAllow: /private/contact\n';
  assert.equal(robotsDisallows(robots, '/'), false);
  assert.equal(robotsDisallows(robots, '/private/x'), true);
  assert.equal(robotsDisallows(robots, '/private/contact'), false);
  const links = inquiryLinks('<a href="/about">About</a><a href="/contact-us">Contact</a><a href="https://other.example/book">Book</a><a href="/services/ac-repair">Request service</a><a href="/brochure.pdf">Free quote PDF</a>', 'https://plumber.example/', 5);
  assert.deepEqual(links, ['https://plumber.example/contact-us', 'https://plumber.example/services/ac-repair']);
});

test('probe is GET-only, honours robots, never requests form hosts, and counts every request', async () => {
  const site = {
    'https://plumber.example/robots.txt': 'User-agent: *\nDisallow: /book',
    'https://plumber.example/': '<a href="/contact">Contact</a><a href="/book">Book</a><a href="tel:5124441111">Call (512) 867-5309</a>',
    'https://plumber.example/contact': '<form method="post" action="https://gone.example/f"><input name="n" required></form>'
  };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method });
    if (!(url in site)) return new Response('nope', { status: 404 });
    return Object.assign(new Response(site[url], { status: 200 }), {});
  };
  const lookups = [];
  const receipt = await probeInquiryPath({
    website: 'https://plumber.example/', fetchImpl, sleep: async () => {},
    lookupImpl: async host => { lookups.push(host); throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' }); },
    now: () => new Date('2026-10-21T00:00:00Z')
  });
  assert.ok(calls.every(call => call.method === 'GET'));
  assert.ok(!calls.some(call => call.url === 'https://plumber.example/book'), 'robots-disallowed page fetched');
  assert.ok(!calls.some(call => call.url.includes('gone.example')), 'form host was requested');
  assert.deepEqual(lookups, ['gone.example']);
  assert.deepEqual(receipt.refusals.map(item => item.reason), ['ROBOTS_DISALLOW']);
  assert.deepEqual(receipt.readOnlyLedger, { httpGetRequests: 2, robotsRequests: 1, dnsLookups: 1, formSubmissions: 0, messages: 0, spendCents: 0 });
  assert.deepEqual(codes(receipt.analysis).slice(0, 2).sort(), ['FORM_SUBMITS_TO_NONEXISTENT_HOST', 'TEL_LABEL_DIALS_DIFFERENT_NUMBER']);
  assert.match(receipt.snapshotMarkdown, /Prove it wrong in 30 seconds/);
});

test('a tool named in marketing copy is not reported as installed', () => {
  const surface = page('<p>We integrate with ServiceTitan and CallRail for every client.</p>');
  assert.deepEqual(surface.leadStack, []);
  assert.deepEqual(surface.callTracking, []);
  assert.deepEqual(page('<iframe src="https://book.servicetitan.com/x"></iframe>').leadStack, ['ServiceTitan']);
});

test('calibration: licensing-board and fax numbers are not counted as business lines', () => {
  const analysis = analyzeInquiryCoherence({ pages: [page(`<a href="tel:9722882263">(972) 288-2263</a>
    <p>${'Regulated by The Texas Department of Licensing and Regulation, P.O. Box 12157, Austin, TX 78711, 1-800-803-9202, 512-463-6599. '.repeat(1)}
    Texas State Board of Plumbing Examiners, Fax (512) 450-0637, Office (512) 936-5200. Our office (972) 288-2263 is staffed daily by our dispatch team.</p>`)] });
  assert.ok(!codes(analysis).includes('MANY_PUBLISHED_NUMBERS'), JSON.stringify(analysis.findings));
  assert.deepEqual(analysis.surface.distinctVisiblePhones, ['(972) 288-2263']);
});

test('calibration: redirect stubs and bot challenges are NOT_OBSERVABLE, never "clean"', () => {
  const stub = extractInquirySurface({ url: 'https://parked.example/', html: '<!DOCTYPE html><html><head><script>window.onload=function(){window.location.href="/lander"}</script></head></html>', status: 200 });
  const challenge = extractInquirySurface({ url: 'https://shielded.example/', html: `<title>One moment, please...</title><p>${'x'.repeat(400)}</p>`, status: 200 });
  assert.equal(stub.observability, 'REDIRECT_STUB');
  assert.equal(challenge.observability, 'BOT_CHALLENGE_OR_INTERSTITIAL');
  const analysis = analyzeInquiryCoherence({ pages: [stub, challenge] });
  assert.equal(analysis.verdict, 'NOT_OBSERVABLE_FROM_STATIC_HTML');
  assert.equal(analysis.unobservablePages.length, 2);
  assert.match(compileCoherenceSnapshot({ analysis }), /Not observable/);
  assert.doesNotMatch(compileCoherenceSnapshot({ analysis }), /real result/);
});

test('calibration: "office hours + 24-hour emergency service" is an observation, not a contradiction', () => {
  const analysis = analyzeInquiryCoherence({ pages: [page(`<script type="application/ld+json">{"@type":"Plumber","telephone":"4803886093","openingHours":["Mo-Fr 07:00-17:00","Sa 08:00-16:00"]}</script>
    <p>Mon-Fri 7a-5p | Sat 8a-4p | 24-hour emergency service</p><a href="tel:4803886093">(480) 388-6093</a>`)] });
  const hit = analysis.findings.find(item => item.code === 'ALWAYS_OPEN_CLAIM_VS_DECLARED_HOURS');
  assert.equal(hit.class, 'OBSERVATION');
  assert.equal(analysis.verdict, 'OBSERVATIONS_ONLY');
});

test('calibration: one stray brace is diagnosed with the exact repair and what machines lose', () => {
  const body = '{\n "@context":"http://www.schema.org",\n "@type":["HVACBusiness","Plumber"],\n "name":"Example Sons",\n "address":{"@type":"PostalAddress"},\n "telephone":"(602) 344-9027"\n}\n}';
  const surface = page(`<script type="application/ld+json">${body}</script><a href="tel:6023449027">(602) 344-9027</a>`);
  const block = surface.schema.invalidBlocks[0];
  assert.match(block.repair, /Delete the stray characters "}" .*line 8/);
  assert.deepEqual(block.discarded.types, ['HVACBusiness', 'Plumber']);
  const hit = analyzeInquiryCoherence({ pages: [surface] }).findings[0];
  assert.equal(hit.code, 'STRUCTURED_DATA_UNPARSEABLE');
  assert.equal(hit.severity, 4);
  assert.match(hit.title, /HVACBusiness \/ Plumber with phone \(602\) 344-9027/);
  assert.match(hit.why, /Repair: Delete the stray/);
});

test('near-miss typo survives a call-tracking caveat; a runtime witness confirms or dissolves mismatches', async () => {
  const { nearMissTypo } = await import('../src/inquiry-path-coherence.mjs');
  const { normalizeRuntimeTelLinks } = await import('../src/inquiry-path-runtime-witness.mjs');
  assert.equal(nearMissTypo('5123051070', '5123050070'), 'one digit different');
  assert.equal(nearMissTypo('5123051070', '5123050170'), 'two adjacent digits swapped');
  assert.equal(nearMissTypo('5129753085', '5122226029'), null);
  const url = 'https://plumber.example/';
  const html = `<script src="https://cdn.callrail.com/companies/1/swap.js"></script>
    <a href="tel:5123050070">(512) 305-1070</a><a href="tel:5122226029">512-975-3085</a><p>${'Bastrop office. '.repeat(20)}</p>`;
  const staticOnly = analyzeInquiryCoherence({ pages: [page(html, url)] });
  const typo = staticOnly.findings.find(item => item.title.includes('one digit different'));
  assert.equal(typo.firstTouchUse, 'MAY_STATE_AS_OBSERVED_FACT');
  assert.equal(staticOnly.findings.find(item => item.title.includes('975-3085')).firstTouchUse, 'ASK_DONT_ASSERT');

  // Runtime: tracking swapped the 975-3085 button coherently, the typo remained.
  const runtimeWitness = { [url]: { telLinks: normalizeRuntimeTelLinks([
    { href: 'tel:5123050070', text: '(512) 305-1070' },
    { href: 'tel:5124449999', text: '(512) 444-9999' }
  ]) } };
  const both = analyzeInquiryCoherence({ pages: [page(html, url)], runtimeWitness });
  const confirmed = both.findings.filter(item => item.code === 'TEL_LABEL_DIALS_DIFFERENT_NUMBER');
  assert.equal(confirmed.length, 1);
  assert.deepEqual(confirmed[0].witnesses, ['STATIC_HTML', 'RUNTIME_MOBILE_BROWSER']);
  assert.equal(confirmed[0].confidence, 0.98);
  assert.deepEqual(both.resolvedAtRuntime.map(item => item.label), ['(512) 975-3085']);
});
