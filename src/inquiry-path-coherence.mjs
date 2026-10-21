// Inquiry Path Coherence Engine.
//
// A home-service business publishes the same facts about itself through many
// channels at once: the phone number painted in the header, the number a
// `tel:` button actually dials, the number in schema.org JSON-LD that search
// engines and AI answer agents read, the hours it claims, and the forms it
// asks visitors to fill. When those channels disagree, the disagreement is a
// verifiable fact rather than an opinion about design, and it is usually the
// kind that loses a booked job: a caller taps "Call (512) 555-0100" and the
// dialer opens a different number.
//
// This module only reads HTML that a caller already fetched. It never fetches,
// submits a form, places a call, or contacts anyone. Every finding carries the
// exact excerpt and the SHA-256 of the bytes it was read from, a class
// (CONTRADICTION / MALFORMATION / ABSENCE / OBSERVATION), and a "thirty-second
// disproof": the step the business owner can take on their own phone to prove
// the finding wrong. A finding that cannot be disproved that way is not
// allowed to be asserted in a first touch.
//
// Scope: North American (NANP) numbers. Other numbering plans are counted and
// reported as NOT_ANALYZED rather than guessed at.

import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const INQUIRY_PATH_COHERENCE_VERSION = 'uberbond.inquiry-path-coherence-1.0.0';

export const FINDING_CLASSES = Object.freeze(['CONTRADICTION', 'MALFORMATION', 'ABSENCE', 'OBSERVATION']);

// Scripts that legitimately rewrite phone numbers in the browser after the
// server delivered the HTML (dynamic number insertion). When one is present a
// static mismatch may be repaired at runtime, so mismatch findings lose their
// right to be asserted and must be asked about instead.
const CALL_TRACKING_FINGERPRINTS = Object.freeze([
  ['CallRail', /cdn\.callrail\.com|callrail\.com\/.*swap|swap\.js\b/i],
  ['CallTrackingMetrics', /tctm\.co|calltrackingmetrics/i],
  ['WhatConverts', /whatconverts/i],
  ['Invoca', /invoca(?:cdn)?\.(?:com|net)|solutions\.invocacdn/i],
  ['Marchex', /marchex/i],
  ['Avanser', /avanser/i],
  ['Google forwarding number', /_googWcmGet|phone_conversion_number/i],
  ['DialogTech/Infinity', /dialogtech|infinity-tracking|infinitycdn/i]
]);

const BOOKING_AND_LEAD_FINGERPRINTS = Object.freeze([
  ['ServiceTitan', /servicetitan/i],
  ['Housecall Pro', /housecallpro/i],
  ['Jobber', /getjobber|jobber\.com|clienthub/i],
  ['Workiz', /workiz/i],
  ['FieldEdge', /fieldedge/i],
  ['Service Fusion', /servicefusion/i],
  ['Calendly', /calendly\.com/i],
  ['Acuity', /acuityscheduling/i],
  ['GoHighLevel/LeadConnector', /leadconnectorhq|msgsndr\.com|gohighlevel/i],
  ['Podium', /podium\.com|podium-widget/i],
  ['Birdeye', /birdeye/i],
  ['Hatch', /usehatchapp|hatchapp/i],
  ['HubSpot Forms', /hsforms|js\.hs-scripts|hubspot\.com\/forms/i],
  ['Jotform', /jotform/i],
  ['Typeform', /typeform\.com/i],
  ['Gravity Forms', /gform_wrapper|gravityforms/i],
  ['WPForms', /wpforms/i],
  ['Contact Form 7', /wpcf7/i]
]);

const NON_BUSINESS_NUMBER_RX = /\bfax\b|licens|regulat|\bboard\b|commission|department of|\bp\.?\s?o\.? box\b|\.gov\b|attorney general|consumer protection/i;
// A page whose server-delivered HTML is a redirect stub, bot challenge or empty
// app shell cannot support any claim, including the claim that it is clean.
const SHELL_TITLE_RX = /one moment|just a moment|attention required|checking your browser|access denied|verify you are human|please wait/i;
const CAPTCHA_RX = /g-recaptcha|recaptcha\/api|hcaptcha|cf-turnstile|challenges\.cloudflare\.com\/turnstile/i;
const ALWAYS_OPEN_RX = /\b24\s*\/\s*7\b|\b24\s*hours?\s+a\s+day\b|\bopen\s+24\b|\bavailable\s+24\b|\bround[-\s]the[-\s]clock\b|\b24-hour\s+emergency\b/i;
// NANP: optional +1, area code and exchange start 2-9, separator required
// between exchange and line so prices, dates and order numbers do not match.
const NANP_RX = /(?<![\d\w])(?:\+?1[\s.\-]?)?\(?([2-9]\d{2})\)?[\s.\-]?([2-9]\d{2})[\s.\-]([0-9]{4})(?!\d)/g;

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const clip = (value, max = 220) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const clone = value => structuredClone(value);

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™' };
export function decodeEntities(value) {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function parseAttributes(source) {
  const attributes = {};
  for (const match of String(source ?? '').matchAll(/([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function stripInvisible(html) {
  return String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ');
}

export function visibleText(html) {
  return clip(decodeEntities(stripInvisible(html).replace(/<[^>]+>/g, ' ')), 2_000_000);
}

/** Ten-digit NANP key, or a structured reason the value is not one. */
export function normalizeTelHref(href) {
  let raw = String(href ?? '').trim().replace(/^tel:/i, '').replace(/^\/\//, '');
  try { raw = decodeURIComponent(raw); } catch { /* keep raw */ }
  raw = raw.split(/[;,?]/)[0];
  if (/[a-z]/i.test(raw.replace(/^\+/, ''))) return { ok: false, reason: 'LETTERS_IN_TEL_HREF', raw };
  const plus = raw.trim().startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (plus && !digits.startsWith('1')) return digits.length >= 7 ? { ok: false, reason: 'NON_NANP_NOT_ANALYZED', raw } : { ok: false, reason: 'TOO_FEW_DIGITS', raw };
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return { ok: false, reason: digits.length < 10 ? 'TOO_FEW_DIGITS' : 'TOO_MANY_DIGITS', raw };
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return { ok: false, reason: 'INVALID_NANP_DIGITS', raw };
  return { ok: true, key: digits };
}

export function phonesInText(text) {
  const found = [];
  for (const match of String(text ?? '').matchAll(NANP_RX)) {
    const key = `${match[1]}${match[2]}${match[3]}`;
    // 555-01xx is the reserved fictional range; real businesses never publish it.
    found.push({ key, display: match[0].trim(), index: match.index, fictional: match[2] === '555' && /^01\d\d$/.test(match[3]) });
  }
  return found;
}

export const formatNanp = key => /^\d{10}$/.test(key) ? `(${key.slice(0, 3)}) ${key.slice(3, 6)}-${key.slice(6)}` : String(key);

// When a block is valid JSON followed by stray characters (the common
// copy-paste accident: one extra `}`), the valid prefix shows exactly what
// machines are throwing away and the stray tail is the whole repair.
export function diagnoseJsonLd(body, error) {
  const position = Number((String(error?.message ?? '').match(/after JSON at position (\d+)/) ?? [])[1]);
  if (!Number.isFinite(position)) return { repair: null, discarded: null };
  let prefix;
  try { prefix = JSON.parse(body.slice(0, position)); } catch { return { repair: null, discarded: null }; }
  const line = body.slice(0, position).split('\n').length;
  const stray = clip(body.slice(position), 40);
  const types = [].concat(prefix?.['@type'] ?? []).map(String);
  return {
    repair: `Delete the stray characters ${JSON.stringify(stray)} after the end of the JSON object (line ${line} of the block).`,
    discarded: { types: types.slice(0, 6), name: clip(prefix?.name, 80) || null, telephone: clip(prefix?.telephone ?? prefix?.contactPoint?.telephone, 40) || null, declaresHours: Boolean(prefix?.openingHours || prefix?.openingHoursSpecification), declaresAddress: Boolean(prefix?.address) }
  };
}

function collectJsonLd(html) {
  const blocks = [];
  for (const match of String(html ?? '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/application\/ld\+json/i.test(parseAttributes(match[1]).type ?? '')) continue;
    try { blocks.push({ ok: true, value: JSON.parse(match[2].trim()) }); }
    catch (error) { blocks.push({ ok: false, error: clip(error.message, 120), excerpt: clip(match[2], 160), ...diagnoseJsonLd(match[2].trim(), error) }); }
  }
  const entities = [];
  const walk = (node, depth = 0) => {
    if (depth > 12 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(item => walk(item, depth + 1)); return; }
    if (node.telephone || node.openingHours || node.openingHoursSpecification) entities.push(node);
    for (const value of Object.values(node)) walk(value, depth + 1);
  };
  blocks.filter(block => block.ok).forEach(block => walk(block.value));
  return { blocks, entities };
}

const DAY_CODES = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
const FULL_DAYS = { monday: 'mo', tuesday: 'tu', wednesday: 'we', thursday: 'th', friday: 'fr', saturday: 'sa', sunday: 'su' };
const fullDayCode = value => FULL_DAYS[String(value ?? '').toLowerCase().replace(/^https?:\/\/schema\.org\//, '')] ?? null;
const coversWholeDay = (opens, closes) => /^00:00/.test(String(opens ?? '')) && /^(23:59|24:00|00:00)/.test(String(closes ?? ''));

/** true = schema declares always-open, false = schema declares hours that are not always-open, null = no hours declared. */
export function schemaDeclaresAlwaysOpen(entities) {
  const days = new Set();
  let declared = false;
  for (const entity of entities) {
    for (const spec of [].concat(entity.openingHoursSpecification ?? [])) {
      if (!spec || typeof spec !== 'object') continue;
      declared = true;
      if (!coversWholeDay(spec.opens, spec.closes)) continue;
      for (const day of [].concat(spec.dayOfWeek ?? [])) { const code = fullDayCode(day); if (code) days.add(code); }
    }
    for (const line of [].concat(entity.openingHours ?? [])) {
      const value = String(line ?? '').trim().toLowerCase();
      if (!value) continue;
      declared = true;
      const [dayPart, timePart] = value.split(/\s+/);
      if (timePart && !coversWholeDay(...timePart.split('-'))) continue;
      const range = dayPart.match(/^([a-z]{2})-([a-z]{2})$/);
      if (range) {
        const from = DAY_CODES.indexOf(range[1]); const to = DAY_CODES.indexOf(range[2]);
        if (from >= 0 && to >= from) DAY_CODES.slice(from, to + 1).forEach(day => days.add(day));
      } else dayPart.split(',').map(day => day.trim()).filter(day => DAY_CODES.includes(day)).forEach(day => days.add(day));
    }
  }
  if (!declared) return null;
  return DAY_CODES.every(day => days.has(day));
}

function extractForms(html, pageUrl) {
  const forms = [];
  for (const match of String(html ?? '').matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)) {
    const attributes = parseAttributes(match[1]);
    const body = match[2];
    const fields = [...body.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)]
      .map(field => ({ tag: field[1].toLowerCase(), ...parseAttributes(field[2]) }))
      .filter(field => !['hidden', 'submit', 'button', 'image', 'reset'].includes(String(field.type ?? '').toLowerCase()));
    let actionUrl = null;
    let actionHost = null;
    const rawAction = String(attributes.action ?? '').trim();
    if (rawAction && !/^(javascript:|#)/i.test(rawAction)) {
      try { const resolved = new URL(rawAction, pageUrl); actionUrl = resolved.href; actionHost = resolved.hostname.toLowerCase(); } catch { actionUrl = rawAction; }
    }
    forms.push({
      method: String(attributes.method ?? 'get').toLowerCase(),
      actionUrl,
      actionHost,
      visibleFieldCount: fields.length,
      requiredFieldCount: fields.filter(field => 'required' in field || field['aria-required'] === 'true').length,
      hasCaptcha: CAPTCHA_RX.test(body),
      looksLikeSearch: fields.length <= 1 && fields.every(field => /search|^s$|^q$/i.test(`${field.name ?? ''} ${field.type ?? ''}`))
    });
  }
  return forms;
}

/**
 * Extract the published inquiry surface of one fetched page.
 * `html` is the exact server-delivered body; its hash anchors every finding.
 */
export function extractInquirySurface({ url, html, fetchedAt = null, status = null } = {}) {
  const source = String(html ?? '');
  const sourceSha256 = sha256(source);
  const telLinks = [];
  const mailtoLinks = [];
  for (const match of source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const attributes = parseAttributes(match[1]);
    const href = String(attributes.href ?? '').trim();
    const anchorText = clip(visibleText(match[2]) || attributes['aria-label'] || attributes.title || '', 160);
    if (/^tel:/i.test(href)) telLinks.push({ href: clip(href, 120), anchorText, normalized: normalizeTelHref(href), textPhones: phonesInText(anchorText).map(phone => phone.key) });
    else if (/^mailto:/i.test(href)) mailtoLinks.push({ href: clip(href, 160), anchorText });
  }
  const text = visibleText(source);
  // Some numbers on a contractor site are not the business's: Texas, for
  // example, requires licensing-board phone numbers on contractor websites.
  const visiblePhones = phonesInText(text).map(phone => {
    const before = text.slice(Math.max(0, phone.index - 80), phone.index);
    return { ...phone, role: NON_BUSINESS_NUMBER_RX.test(before) ? 'REGULATORY_OR_FAX' : 'BUSINESS', excerpt: clip(text.slice(Math.max(0, phone.index - 60), phone.index + phone.display.length + 60), 180) };
  });
  const { blocks, entities } = collectJsonLd(source);
  const schemaPhones = entities.flatMap(entity => [].concat(entity.telephone ?? []).map(value => ({ raw: clip(value, 60), normalized: normalizeTelHref(String(value)), entityType: clip([].concat(entity['@type'] ?? 'Thing').join('/'), 60), entityName: clip(entity.name, 80) })));
  const alwaysOpenMatch = text.match(ALWAYS_OPEN_RX);
  // Fingerprint only what is wired into the page (resource URLs, form targets,
  // class names, inline script), never marketing copy that merely names a tool.
  const technical = [
    ...[...source.matchAll(/\b(?:src|href|action|class|data-[a-z-]+)\s*=\s*["']([^"']*)["']/gi)].map(match => match[1]),
    ...[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(match => match[1])
  ].join('\n');
  const fingerprint = list => list.filter(([, rx]) => rx.test(technical)).map(([name]) => name);
  const title = clip(decodeEntities((source.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i) ?? [])[1] ?? ''), 160);
  const forms = extractForms(source, url);
  // Short pages are fine when they still publish something inspectable.
  const empty = text.length < 200 && !telLinks.length && !forms.length && !blocks.length && !visiblePhones.length;
  const observability = SHELL_TITLE_RX.test(title) ? 'BOT_CHALLENGE_OR_INTERSTITIAL'
    : empty && /location(?:\.href)?\s*=|http-equiv=["']?refresh/i.test(source) ? 'REDIRECT_STUB'
      : empty ? 'NO_STATIC_CONTENT' : 'STATIC_HTML_READABLE';
  return {
    url: String(url ?? ''),
    fetchedAt,
    status,
    sourceSha256,
    byteLength: Buffer.byteLength(source),
    title,
    observability,
    telLinks,
    mailtoLinks,
    visiblePhones,
    schema: { blockCount: blocks.length, invalidBlocks: blocks.filter(block => !block.ok), phones: schemaPhones, alwaysOpen: schemaDeclaresAlwaysOpen(entities) },
    alwaysOpenClaim: alwaysOpenMatch ? clip(text.slice(Math.max(0, alwaysOpenMatch.index - 60), alwaysOpenMatch.index + alwaysOpenMatch[0].length + 60), 180) : null,
    forms,
    callTracking: fingerprint(CALL_TRACKING_FINGERPRINTS),
    leadStack: fingerprint(BOOKING_AND_LEAD_FINGERPRINTS)
  };
}

function finding({ code, findingClass, severity, confidence, title, why, disproof, evidence, runtimeCaveat = null }) {
  const assertable = findingClass !== 'OBSERVATION' && confidence >= 0.85 && !runtimeCaveat;
  return {
    code,
    class: findingClass,
    severity,
    confidence: Number(confidence.toFixed(2)),
    title,
    why,
    thirtySecondDisproof: disproof,
    evidence: evidence.slice(0, 6),
    runtimeCaveat,
    firstTouchUse: assertable ? 'MAY_STATE_AS_OBSERVED_FACT' : 'ASK_DONT_ASSERT'
  };
}

/**
 * Cross-page coherence analysis.
 * `pages` are extractInquirySurface results. `hostResolution` optionally maps a
 * form-action hostname to RESOLVED / NXDOMAIN / ERROR from a separate DNS probe.
 */
/** 'one digit substituted' / 'two adjacent digits swapped', else null. */
export function nearMissTypo(a, b) {
  if (!/^\d{10}$/.test(a) || !/^\d{10}$/.test(b) || a === b) return null;
  const diff = [...a].map((digit, index) => digit !== b[index] ? index : -1).filter(index => index >= 0);
  if (diff.length === 1) return 'one digit different';
  if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) return 'two adjacent digits swapped';
  return null;
}

export function analyzeInquiryCoherence({ pages = [], hostResolution = {}, runtimeWitness = {}, business = null } = {}) {
  const fetched = pages.filter(page => page && page.sourceSha256 && (page.status === null || (page.status >= 200 && page.status < 300)));
  const usable = fetched.filter(page => (page.observability ?? 'STATIC_HTML_READABLE') === 'STATIC_HTML_READABLE');
  const unobservable = fetched.filter(page => !usable.includes(page)).map(page => ({ url: page.url, observability: page.observability, sourceSha256: page.sourceSha256 }));
  const findings = [];
  const callTracking = [...new Set(usable.flatMap(page => page.callTracking))];
  const swapCaveat = callTracking.length ? `CLIENT_SIDE_NUMBER_SWAP_POSSIBLE: ${callTracking.join(', ')} script detected; numbers may be rewritten in the browser after load.` : null;
  const ev = (page, excerpt) => ({ url: page.url, excerpt: clip(excerpt, 220), sourceSha256: page.sourceSha256 });

  // 1. A tap-to-call control whose label shows one number and dials another.
  const mismatches = usable.flatMap(page => page.telLinks
    .filter(link => link.normalized.ok && link.textPhones.length && !link.textPhones.includes(link.normalized.key))
    .map(link => ({ page, link })));
  const mismatchKeys = new Map();
  for (const item of mismatches) {
    const key = `${item.link.textPhones[0]}>${item.link.normalized.key}`;
    if (!mismatchKeys.has(key)) mismatchKeys.set(key, []);
    mismatchKeys.get(key).push(item);
  }
  const resolvedAtRuntime = [];
  for (const items of mismatchKeys.values()) {
    const { link } = items[0];
    const label = link.textPhones[0];
    const target = link.normalized.key;
    // A second, independent witness: the same page after its scripts ran.
    const witnessed = items.map(({ page }) => runtimeWitness[page.url]).filter(entry => Array.isArray(entry?.telLinks));
    const persists = witnessed.some(entry => entry.telLinks.some(item => item.normalized?.ok && item.normalized.key === target && item.textPhones?.includes(label)));
    if (witnessed.length && !persists) { resolvedAtRuntime.push({ label: formatNanp(label), target: formatNanp(target), pages: items.map(({ page }) => page.url) }); continue; }
    const typo = nearMissTypo(label, target);
    // Tracking pools issue unrelated numbers; one keystroke away is a typo.
    const caveat = persists || typo ? null : swapCaveat;
    findings.push(finding({
      code: 'TEL_LABEL_DIALS_DIFFERENT_NUMBER', findingClass: 'CONTRADICTION', severity: 5,
      confidence: caveat ? 0.6 : persists ? 0.98 : typo ? 0.92 : 0.97,
      title: `A call button labelled ${formatNanp(label)} dials ${formatNanp(target)}${typo ? ` (${typo})` : ''}`,
      why: `A visitor who taps the button reaches a different line than the one printed on it.${typo ? ' The two numbers differ by a single keystroke, the signature of a typing error rather than call tracking, which assigns unrelated numbers.' : ''} If either line is unmonitored, forwarded late, or belongs to a retired tracking pool, the call is lost before anyone can book it.${persists ? ' Confirmed twice: in the HTML the server sent, and again in a phone-sized browser after the page\'s own scripts ran, as a direct visitor would see it.' : ''}`,
      disproof: `On a phone, open ${items[0].page.url} and tap the "${clip(link.anchorText, 60)}" control. If the dialer shows ${formatNanp(label)}, this finding is wrong.`,
      evidence: items.map(({ page, link: item }) => ev(page, `<a href="${item.href}"> ${item.anchorText}`)),
      runtimeCaveat: caveat
    }));
    findings.at(-1).witnesses = persists ? ['STATIC_HTML', 'RUNTIME_MOBILE_BROWSER'] : ['STATIC_HTML'];
  }

  // 2. Malformed tap-to-call targets (letters, missing digits).
  const malformed = usable.flatMap(page => page.telLinks.filter(link => !link.normalized.ok && link.normalized.reason !== 'NON_NANP_NOT_ANALYZED').map(link => ({ page, link })));
  if (malformed.length) {
    findings.push(finding({
      code: 'TEL_LINK_MALFORMED', findingClass: 'MALFORMATION', severity: 5, confidence: 0.95,
      title: `${malformed.length} call link${malformed.length === 1 ? '' : 's'} cannot dial a complete North American number`,
      why: 'Phones either refuse the link or dial an incomplete number; the visitor sees an error at the moment they decided to call.',
      disproof: `Tap the link on ${malformed[0].page.url} ("${clip(malformed[0].link.anchorText, 50)}"). If a complete 10-digit number appears in the dialer, this finding is wrong.`,
      evidence: malformed.map(({ page, link }) => ev(page, `${link.href} [${link.normalized.reason}] ${link.anchorText}`))
    }));
  }

  // 3. Numbers on the page but nothing tappable anywhere.
  const visibleKeys = new Map();
  for (const page of usable) for (const phone of page.visiblePhones) {
    if (phone.fictional || phone.role === 'REGULATORY_OR_FAX') continue;
    if (!visibleKeys.has(phone.key)) visibleKeys.set(phone.key, []);
    visibleKeys.get(phone.key).push({ page, phone });
  }
  const telCount = usable.reduce((sum, page) => sum + page.telLinks.length, 0);
  if (visibleKeys.size && telCount === 0) {
    const [firstKey, sightings] = [...visibleKeys.entries()][0];
    findings.push(finding({
      code: 'PHONE_SHOWN_BUT_NOT_TAPPABLE', findingClass: 'ABSENCE', severity: 4, confidence: 0.9,
      title: `${formatNanp(firstKey)} is printed but no inspected page offers a tap-to-call link`,
      why: 'Most home-service emergencies are searched on a phone. A number that cannot be tapped must be memorised or copied, and some visitors call the next result instead.',
      disproof: `On a phone, open ${sightings[0].page.url} and tap the printed number. If the dialer opens, this finding is wrong (some phones auto-detect numbers; a coded tel: link does not depend on that).`,
      evidence: sightings.map(({ page, phone }) => ev(page, phone.excerpt)),
      runtimeCaveat: swapCaveat
    }));
  }

  // 4. The number published to search engines and AI agents is not one a visitor sees.
  const telKeys = new Set(usable.flatMap(page => page.telLinks.filter(link => link.normalized.ok).map(link => link.normalized.key)));
  const humanKeys = new Set([...visibleKeys.keys(), ...telKeys]);
  const schemaOnly = usable.flatMap(page => page.schema.phones.filter(phone => phone.normalized.ok && !humanKeys.has(phone.normalized.key)).map(phone => ({ page, phone })));
  if (schemaOnly.length && humanKeys.size) {
    const distinct = [...new Set(schemaOnly.map(item => item.phone.normalized.key))];
    findings.push(finding({
      code: 'MACHINE_READABLE_PHONE_DIVERGES', findingClass: 'CONTRADICTION', severity: 3,
      confidence: swapCaveat ? 0.6 : 0.88,
      title: `Structured data tells search engines and AI assistants ${distinct.map(formatNanp).join(', ')}, which visitors never see on the page`,
      why: 'Google, maps, voice assistants and AI answer engines read schema.org markup. A different number there sends machine-referred callers to a line the business may not be watching or measuring.',
      disproof: `Paste ${schemaOnly[0].page.url} into Google's Rich Results Test or Schema Markup Validator; if the telephone shown matches ${[...humanKeys].slice(0, 2).map(formatNanp).join(' or ')}, this finding is wrong.`,
      evidence: schemaOnly.map(({ page, phone }) => ev(page, `JSON-LD ${phone.entityType}${phone.entityName ? ` "${phone.entityName}"` : ''} telephone: ${phone.raw}`)),
      runtimeCaveat: swapCaveat
    }));
  }

  // 5. Advertises always-open while declaring limited hours to machines.
  const claimPage = usable.find(page => page.alwaysOpenClaim);
  const limitedHoursPage = usable.find(page => page.schema.alwaysOpen === false);
  if (claimPage && limitedHoursPage) {
    // "Mon-Fri 7-5, 24-hour emergency service" is a coherent business model, not a contradiction.
    const emergencyQualified = /emergenc/i.test(claimPage.alwaysOpenClaim);
    findings.push(finding({
      code: 'ALWAYS_OPEN_CLAIM_VS_DECLARED_HOURS', findingClass: emergencyQualified ? 'OBSERVATION' : 'CONTRADICTION', severity: emergencyQualified ? 2 : 3, confidence: 0.72,
      title: 'The page advertises round-the-clock service while its structured data declares limited opening hours',
      why: 'Search and AI assistants that read the declared hours may describe the business as closed at night, exactly when emergency callers are deciding whom to call. It can also be intentional (office hours plus an emergency line), so this is a question, not a verdict.',
      disproof: `Check whether a separate always-open emergency service or line is declared to machines on ${limitedHoursPage.url}; if it is, this finding is wrong.`,
      evidence: [ev(claimPage, claimPage.alwaysOpenClaim), ev(limitedHoursPage, 'JSON-LD openingHours / openingHoursSpecification does not cover 7 days x 24 hours')]
    }));
  }

  // 6. Form posts to a host that does not exist.
  const deadForms = usable.flatMap(page => page.forms.filter(form => form.actionHost && hostResolution[form.actionHost] === 'NXDOMAIN').map(form => ({ page, form })));
  if (deadForms.length) {
    findings.push(finding({
      code: 'FORM_SUBMITS_TO_NONEXISTENT_HOST', findingClass: 'MALFORMATION', severity: 5, confidence: 0.9,
      title: `A form submits to ${deadForms[0].form.actionHost}, a hostname that does not resolve`,
      why: 'A browser cannot deliver the submission. Unless a script intercepts it first, the visitor fills the form and the inquiry goes nowhere.',
      disproof: `Ask whoever manages ${deadForms[0].page.url} for the most recent submission received from that form; a submission dated after this observation disproves it.`,
      evidence: deadForms.map(({ page, form }) => ev(page, `<form method="${form.method}" action="${form.actionUrl}"> DNS: NXDOMAIN`))
    }));
  }

  // 7. Heavy forms: observation only, never asserted.
  const heavy = usable.flatMap(page => page.forms.filter(form => !form.looksLikeSearch && form.requiredFieldCount >= 7).map(form => ({ page, form })));
  if (heavy.length) {
    findings.push(finding({
      code: 'HIGH_FRICTION_INQUIRY_FORM', findingClass: 'OBSERVATION', severity: 2, confidence: 0.8,
      title: `An inquiry form requires ${heavy[0].form.requiredFieldCount} fields before submission`,
      why: 'Every required field is a chance to abandon. Whether that trade-off is right depends on lead quality, which only the business can see.',
      disproof: 'Count the required fields on the live form; if fewer than seven are required, this observation is wrong.',
      evidence: heavy.map(({ page, form }) => ev(page, `${form.visibleFieldCount} visible fields, ${form.requiredFieldCount} required${form.hasCaptcha ? ', CAPTCHA' : ''}`))
    }));
  }

  // 8. Many distinct numbers: observation only (tracking pools are legitimate).
  if (visibleKeys.size >= 3) {
    findings.push(finding({
      code: 'MANY_PUBLISHED_NUMBERS', findingClass: 'OBSERVATION', severity: 2, confidence: 0.85,
      title: `${visibleKeys.size} different phone numbers are printed across the inspected pages`,
      why: 'Separate numbers are often deliberate call tracking. Each one is also a line that must still forward to a staffed phone; retired tracking numbers keep ringing nowhere for years.',
      disproof: 'Confirm each listed number currently forwards to a monitored line; if all do, there is nothing to fix.',
      evidence: [...visibleKeys.entries()].map(([key, sightings]) => ev(sightings[0].page, `${formatNanp(key)}: ${sightings[0].phone.excerpt}`))
    }));
  }

  for (const page of usable) for (const block of page.schema.invalidBlocks) {
    findings.push(finding({
      code: 'STRUCTURED_DATA_UNPARSEABLE', findingClass: 'MALFORMATION', severity: block.discarded?.telephone || block.discarded?.declaresHours ? 4 : 3, confidence: 0.95,
      title: block.discarded?.types?.length
        ? `The structured data declaring this business as ${block.discarded.types.join(' / ')}${block.discarded.telephone ? ` with phone ${block.discarded.telephone}` : ''} is invalid JSON, so machines discard all of it`
        : 'A structured-data block is invalid JSON, so search engines and AI agents ignore all of it',
      why: `Search engines, maps and AI answer agents that read schema.org markup skip a block that does not parse${block.discarded ? ` — here that includes the business type${block.discarded.telephone ? ', phone' : ''}${block.discarded.declaresAddress ? ', address' : ''}${block.discarded.declaresHours ? ', opening hours' : ''}` : ''}.${block.repair ? ` Repair: ${block.repair}` : ''}`,
      disproof: `Run ${page.url} through Google's Rich Results Test or the Schema Markup Validator; if no parse error is reported, this finding is wrong.`,
      evidence: [ev(page, `${block.error}: ${block.excerpt}`)]
    }));
  }

  findings.sort((a, b) => b.severity * b.confidence - a.severity * a.confidence);
  const assertable = findings.filter(item => item.firstTouchUse === 'MAY_STATE_AS_OBSERVED_FACT');
  return {
    ok: true,
    policyVersion: INQUIRY_PATH_COHERENCE_VERSION,
    business,
    pagesAnalyzed: usable.length,
    pagesRejected: pages.length - usable.length,
    unobservablePages: unobservable,
    resolvedAtRuntime,
    surface: {
      distinctVisiblePhones: [...visibleKeys.keys()].map(formatNanp),
      distinctTelTargets: [...telKeys].map(formatNanp),
      telLinkCount: telCount,
      formCount: usable.reduce((sum, page) => sum + page.forms.filter(form => !form.looksLikeSearch).length, 0),
      callTracking,
      leadStack: [...new Set(usable.flatMap(page => page.leadStack))],
      nonNanpTelLinks: usable.reduce((sum, page) => sum + page.telLinks.filter(link => link.normalized.reason === 'NON_NANP_NOT_ANALYZED').length, 0)
    },
    findings,
    verdict: assertable.length ? 'ASSERTABLE_DEFECT_OBSERVED' : findings.some(item => item.class !== 'OBSERVATION') ? 'QUESTION_WORTH_ASKING' : findings.length ? 'OBSERVATIONS_ONLY' : usable.length ? 'NO_INCOHERENCE_OBSERVED' : 'NOT_OBSERVABLE_FROM_STATIC_HTML',
    truthBoundary: 'Server-delivered HTML of the listed pages at the listed time only. Not a test call, not a form submission, not proof of lost revenue, and not an audit of runtime scripts, call routing or staffing.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

const CLASS_LABEL = { CONTRADICTION: 'Contradiction', MALFORMATION: 'Broken', ABSENCE: 'Missing', OBSERVATION: 'Worth checking' };

/** Buyer-readable one-page snapshot. Contains only what the analysis observed. */
export function compileCoherenceSnapshot({ analysis, observedAt, preparedFor = null } = {}) {
  if (!analysis?.ok) throw new Error('analysis required');
  const name = analysis.business?.name ?? analysis.business?.website ?? 'the inspected website';
  const lines = [
    `# Inquiry Path Coherence Snapshot — ${name}`,
    '',
    `Observed ${observedAt ?? 'at an unrecorded time'} · ${analysis.pagesAnalyzed} public page${analysis.pagesAnalyzed === 1 ? '' : 's'} · read-only${preparedFor ? ` · prepared for ${preparedFor}` : ''}`,
    '',
    'This checks whether the website tells callers, search engines and AI assistants the same thing about how to reach the business. Every item below includes the exact text it was read from and a 30-second way to prove it wrong.',
    '',
    `**Result:** ${{ ASSERTABLE_DEFECT_OBSERVED: 'At least one verifiable break in the inquiry path was observed.', QUESTION_WORTH_ASKING: 'Nothing provably broken, but at least one inconsistency is worth a question.', OBSERVATIONS_ONLY: 'No breaks observed; a few items worth confirming.', NO_INCOHERENCE_OBSERVED: 'No incoherence observed on the inspected pages.', NOT_OBSERVABLE_FROM_STATIC_HTML: 'Not observable: no inspected page returned readable HTML (error status, redirect stub, bot challenge or empty shell), so nothing can be claimed either way.' }[analysis.verdict]}`,
    '',
    `Phones printed: ${analysis.surface.distinctVisiblePhones.join(', ') || 'none'} · Tap-to-call targets: ${analysis.surface.distinctTelTargets.join(', ') || 'none'} · Inquiry forms: ${analysis.surface.formCount}${analysis.surface.leadStack.length ? ` · Lead tools seen: ${analysis.surface.leadStack.join(', ')}` : ''}${analysis.surface.callTracking.length ? ` · Call tracking seen: ${analysis.surface.callTracking.join(', ')}` : ''}`,
    ''
  ];
  analysis.findings.forEach((item, index) => {
    lines.push(`## ${index + 1}. ${CLASS_LABEL[item.class]}: ${item.title}`, '', item.why, '', `**Prove it wrong in 30 seconds:** ${item.thirtySecondDisproof}`, '');
    if (item.runtimeCaveat) lines.push(`_Caveat: ${item.runtimeCaveat}_`, '');
    lines.push('Evidence:', ...item.evidence.map(entry => `- ${entry.url} — “${entry.excerpt}” (page sha256 ${entry.sourceSha256.slice(0, 12)}…)`), '');
  });
  if (!analysis.findings.length && analysis.pagesAnalyzed) lines.push('No findings. That is a real result, not a missing one.', '');
  if (analysis.unobservablePages?.length) lines.push(`Not inspected (${analysis.unobservablePages.map(page => `${page.url}: ${page.observability}`).join('; ')}).`, '');
  lines.push('---', '', `Limits: ${analysis.truthBoundary}`, '', `Engine: ${analysis.policyVersion}`);
  return lines.join('\n');
}
