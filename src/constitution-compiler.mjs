// V3 A001-A030. The repository constitution as machine-readable Directive
// Objects.
//
// The canon is prose, and prose cannot be checked. Nine files carry a few
// hundred normative statements -- "never", "must not", "may only" -- and
// nothing in the repository knows which of them any test enforces. The
// reserved-domain guard and the mailbox-address guard were both constitutional
// rules ("no unauthorized external effects", "authority may narrow but never
// widen") with no enforcement anywhere, and both were found by accident during
// unrelated archaeology rather than by asking.
//
// This compiles the prose into objects so the question can be asked directly.
// It does not claim the answer is proof: see linkage strength below.
import crypto from 'node:crypto';

export const CONSTITUTION_COMPILER_VERSION = 'uberbond.constitution-compiler.v1';

/** Canon files, in precedence order. NORTH_STAR.md and the precedence file define that order. */
export const CANON_SOURCES = Object.freeze([
  'NORTH_STAR.md',
  'AGENTS.md',
  'CLAUDE.md',
  'UBERBOND_CANON.md',
  'AI_START_HERE.md',
  'docs/NORTH_STAR_PRECEDENCE.md',
  'docs/WALLBREAKER_CANON.md',
  'docs/CAPABILITY_GENOME_CANON.md',
  'docs/AI_SKILL_PLUGIN_ASSIMILATION_CANON.md'
]);

// Ordered: the first match wins, and prohibitions are tested before
// obligations because "must never" is a prohibition, not an obligation.
const CLASSIFIERS = Object.freeze([
  { class: 'PROHIBITION', pattern: /\b(never|must not|may not|shall not|cannot|do not|does not|is not permitted|forbidden|prohibited|no\s+\w+\s+may)\b/i },
  { class: 'OBLIGATION', pattern: /\b(must|shall|required|requires|always|should)\b/i },
  { class: 'PERMISSION', pattern: /\b(may|can|is allowed|is permitted)\b/i }
]);

/**
 * Words whose presence means the rule governs something that touches the world
 * outside this repository. A rule about external effects that no test enforces
 * is a different kind of hole from a rule about naming.
 */
const EXTERNAL_EFFECT_TERMS = Object.freeze([
  'send', 'sends', 'sending', 'outbound', 'contact', 'message', 'messages', 'email',
  'spend', 'spends', 'purchase', 'payment', 'money', 'kyc', 'invoice', 'refund',
  'deploy', 'deployment', 'production', 'dns', 'credential', 'credentials', 'secret',
  'customer', 'customers', 'prospect', 'provider', 'publish', 'publishing', 'scrape',
  'captcha', 'consent', 'suppression', 'quota'
]);

const STOPWORDS = new Set(['the','and','that','this','with','from','into','than','then','when','what','which','their','there','these','those','have','has','had','not','but','for','are','was','were','been','being','its','it','a','an','of','to','in','on','by','as','or','is','be','at','if','no','any','all','may','can','must','never','should','shall','always','do','does','done','only','more','most','such','other','same','each','every','while','because','rather','without','within','before','after','over','under','about','also','one','two','three','part','make','makes','made','use','uses','used','using','new','own','way','well','still','even','just','very','much','many','some','they','them','he','she','you','we','us','our','your','his','her','would','could','should','will','shall']);

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const normalize = text => text.replace(/\s+/g, ' ').trim();

/** Content-derived, so an edited directive becomes a new one needing re-review. */
export function directiveId(source, text) {
  const slug = source.replace(/^docs\//, '').replace(/\.md$/, '').replace(/[^A-Za-z0-9]+/g, '-').toUpperCase();
  return `${slug}-${sha(normalize(text)).slice(0, 8)}`;
}

/** Distinctive words, for linking a directive to code and tests that mention the same things. */
export function distinctiveTerms(text) {
  const words = normalize(text).toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [];
  return [...new Set(words.filter(word => !STOPWORDS.has(word)))];
}

function classify(text) {
  for (const entry of CLASSIFIERS) if (entry.pattern.test(text)) return entry.class;
  return null;
}

function authorityClass(text) {
  const lower = normalize(text).toLowerCase();
  const hits = EXTERNAL_EFFECT_TERMS.filter(term => new RegExp(`\\b${term}\\b`).test(lower));
  return hits.length ? { authorityClass: 'EXTERNAL_EFFECT', authorityTerms: hits } : { authorityClass: 'INTERNAL', authorityTerms: [] };
}

/**
 * Sentences, from markdown. Code fences, headings, tables and link-only lines
 * are dropped: a fenced hierarchy diagram is full of capitalised words and no
 * normative content, and treating one as a directive would bury the real ones.
 */
export function normativeSentences(markdown) {
  const withoutFences = markdown.replace(/```[\s\S]*?```/g, '\n');
  const out = [];
  for (const rawLine of withoutFences.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('|') || line.startsWith('>') || /^[-=]{3,}$/.test(line)) continue;
    const body = line.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '');
    if (body.length < 25) continue;
    // Split on sentence ends and on the semicolons the canon uses for lists of
    // separate rules, so "A must X; B must never Y" becomes two directives.
    for (const piece of body.split(/(?<=[.!?])\s+(?=[A-Z`])|;\s+/)) {
      const sentence = normalize(piece).replace(/^[`*_]+|[`*_]+$/g, '');
      if (sentence.length >= 25 && /[a-z]/.test(sentence)) out.push(sentence);
    }
  }
  return out;
}

/**
 * A directive is linked to a test when the test file mentions enough of its
 * distinctive vocabulary.
 *
 * This is the weakest thing in the file and it is deliberately not called
 * proof. Shared vocabulary shows a test talks about the same subject; it does
 * not show the test would fail if the rule were broken. Only a mutation that
 * removes the rule and turns a test red shows that. What this is good for is
 * the negative: a directive no test so much as mentions is very unlikely to be
 * enforced, and that list is short enough to read.
 */
export function linkTests(terms, testIndex, { minimumTerms = 3 } = {}) {
  if (terms.length < minimumTerms) return [];
  const scored = [];
  for (const [file, fileTerms] of testIndex) {
    const shared = terms.filter(term => fileTerms.has(term));
    if (shared.length >= minimumTerms) scored.push({ file, shared: shared.length, terms: shared.slice(0, 6) });
  }
  return scored.sort((a, b) => b.shared - a.shared).slice(0, 3);
}

/**
 * A directive linked to a mutation guard is the strongest evidence available
 * here, and it is a different kind of evidence from a test link.
 *
 * A mutation anchor is a protection that was deliberately removed and a test
 * that went red because of it. So when a constitutional prohibition shares its
 * subject with a killed anchor's guard, something in the repository actually
 * fails when that protection is taken away. Vocabulary overlap still chooses
 * the pairing, so the match is a candidate -- but what it points at is proven
 * enforcement rather than a file that merely discusses the topic.
 */
export function linkMutationGuards(terms, guardIndex, { minimumTerms = 2 } = {}) {
  if (terms.length < minimumTerms) return [];
  const scored = [];
  for (const { id, guard, guardTerms } of guardIndex) {
    const shared = terms.filter(term => guardTerms.has(term));
    if (shared.length >= minimumTerms) scored.push({ id, guard, shared: shared.length, terms: shared.slice(0, 5) });
  }
  return scored.sort((a, b) => b.shared - a.shared).slice(0, 3);
}

export function compileDirective({ source, text, sourceSha, testIndex = new Map(), guardIndex = [], precedence = 0 }) {
  const directiveClass = classify(text);
  if (!directiveClass) return null;
  const terms = distinctiveTerms(text);
  const authority = authorityClass(text);
  const tests = linkTests(terms, testIndex);
  const guards = linkMutationGuards(terms, guardIndex);
  return {
    id: directiveId(source, text),
    text: normalize(text),
    class: directiveClass,
    // Precedence is the canon's own file order, not an importance judgement.
    priority: precedence,
    dependencies: [],
    conflicts: [],
    supersedes: [],
    evidenceRequirements: authority.authorityClass === 'EXTERNAL_EFFECT'
      ? ['DURABLE_EXTERNAL_RECEIPT_OR_EXPLICIT_REFUSAL']
      : ['REPOSITORY_TEST_OR_EXECUTABLE_CHECK'],
    ...authority,
    distinctiveTerms: terms.slice(0, 12),
    tests: tests.map(entry => entry.file),
    testLinkage: tests.length
      ? { strength: 'VOCABULARY_OVERLAP_ONLY__NOT_PROOF_OF_ENFORCEMENT', matches: tests }
      : { strength: 'NONE', matches: [] },
    mutationGuards: guards.map(entry => entry.id),
    mutationLinkage: guards.length
      ? { strength: 'GUARD_SUBJECT_OVERLAP__THE_GUARD_ITSELF_IS_MUTATION_KILLED', matches: guards }
      : { strength: 'NONE', matches: [] },
    // Three states, strongest first. Enforcement is claimed only for the
    // first, and even there the pairing was chosen by vocabulary.
    status: guards.length
      ? 'COMPILED_WITH_MUTATION_GUARD'
      : tests.length ? 'COMPILED_WITH_CANDIDATE_TESTS' : 'COMPILED_NO_TEST_MENTIONS_IT',
    provenance: source,
    sourceSha
  };
}

/**
 * Contradiction candidates: one directive prohibits what another obliges, on a
 * subject they both name.
 *
 * Most real pairs here are not contradictions -- canon routinely says "never X
 * without authority" beside "must X when authorized" -- so this reports
 * candidates for reading, never a verdict.
 */
export function contradictionCandidates(directives, { minimumSharedTerms = 4 } = {}) {
  const prohibitions = directives.filter(row => row.class === 'PROHIBITION');
  const obligations = directives.filter(row => row.class === 'OBLIGATION');
  const pairs = [];
  for (const prohibition of prohibitions) {
    const left = new Set(prohibition.distinctiveTerms);
    for (const obligation of obligations) {
      if (obligation.provenance === prohibition.provenance && obligation.text === prohibition.text) continue;
      const shared = obligation.distinctiveTerms.filter(term => left.has(term));
      if (shared.length >= minimumSharedTerms) {
        pairs.push({ prohibition: prohibition.id, obligation: obligation.id, sharedTerms: shared, note: 'Candidate only. A conditional pair -- never X without authority, must X when authorized -- shares vocabulary and does not contradict.' });
      }
    }
  }
  return pairs.sort((a, b) => b.sharedTerms.length - a.sharedTerms.length);
}
