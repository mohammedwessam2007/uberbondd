#!/usr/bin/env node
// Repository Index: a deterministic, regenerable card catalog of every tracked file.
// Read-only over the tree; writes only docs/index/* and artifacts/repository-index/index.json.
// Navigation aid, not truth: a file being indexed proves nothing about runtime, deployment or outcomes.
//
//   npm run repo:index          regenerate
//   npm run repo:index:check    exit 1 when the committed index is stale
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_INDEX_SCHEMA = 'uberbond.repository-index.v1';
const OUT_DIR = 'docs/index';
const OUT_JSON = 'artifacts/repository-index/index.json';
const LEGACY_DIR = 'docs/history/root-legacy/';
const MAX_READ = 2 * 1024 * 1024;

// ---------------------------------------------------------------- domains
// Ordered: the first matching rule wins. Names are normalised (lower-case, `_` -> `-`).
export const DOMAINS = [
  ['north-star-life', 'North Star and life systems', 'Sovereign Cognitive Continuum, Personal Civilization Engine and their life organs: forecasting, decision packets, sovereignty guards, capability/experience/identity models.'],
  ['ubermind-doctrine', 'UberMind doctrine and library', 'UberMind constitutions V4-V10, the Omega46-52 resident cards, the founder 52-concept sources and the grand library archives.'],
  ['continuity-memory', 'Continuity, memory and handoffs', 'Brain packet, Total Brain, Master Memory, PHOENIX checkpoints, context journals, handoffs and cross-chat recovery.'],
  ['history-forensics', 'History and forensics', 'Frozen historical record: day-by-day forensics, recovered PR/issue/commit lineage, archived ZIPs and legacy root documents.'],
  ['genesis-frontier', 'GENESIS, moonshots and Perpetual Frontier', 'Founder 890 moonshot corpus and its compilers, GENESIS/GENESIS2/Ontogenesis, Gamechanger sensing, million-branch ideation.'],
  ['asi-research', 'ASI research and evidence programs', 'NULLSTAR, Omega private-evidence lab, C21 evidence factory and the mathematical canary families used as held-out capability probes.'],
  ['frontier-cognition', 'Frontier cognition and model routing', 'UberMind economics, Infinite Opus, Crown, Jev, OpenRouter market, frontier VM/runtime, semantic closure and model/provider executors.'],
  ['capability-genome', 'Capability Genome, skills and Wallbreaker', 'World capability discovery, admission and retrieval, the neural exocortex, Avengers arsenal, project skills and the Wallbreaker planner.'],
  ['agent-mesh-autonomy', 'Agent mesh, relay and autonomy', 'Agent autonomy loop, mesh control plane, relays, Uber Socket, durable scheduling, job handlers, overnight and Nightfall lanes.'],
  ['self-maintenance', 'Self-maintenance and verification', 'Self-maintainer, recursive governance, constitution compiler, mutation testing, sandboxes, coverage and reachability audits, secret sweeps.'],
  ['governance-proof', 'Governance, authority and proof', 'OMNIA admission kernel, consent and authority receipts, proof DAGs, evidence integrity and external-effect law.'],
  ['email-infrastructure', 'Email infrastructure and warmup', 'UberWarm/UberWarm2, Winnr, UberMail, UberDoso, DNS and domain/mailbox fleet, placement and reputation.'],
  ['outreach-distribution', 'Outreach and distribution', 'Prospecting, qualification, message tournaments, outbound sending gates, reply handling, suppression and the Distribution OS.'],
  ['commerce-payments', 'Commerce, payments and economics', 'Offers, revenue runtime, PayPal/payment truth, fulfilment and delivery, economic reliability and wealth engines, the lite cash engine.'],
  ['opportunity-intelligence', 'Opportunity and world intelligence', 'Prometheus, Event Horizon, World Brain, opportunity factory, market signals, public-web research adapters and quant research.'],
  ['sovereign-infra', 'Sovereign infrastructure and runtime', 'Self-host stack, UberCel/UberLit/UberCloud/UberOS, Postgres and stores, provider adapters, deployment and platform configuration.'],
  ['founder-operations', 'Founder operations and command center', 'Command center UI and status, founder-absence readiness, Kilimanjaro evidence, operator escalation and health.'],
  ['core-misc', 'Core and uncategorised', 'Server core, shared utilities and files whose name did not match a domain rule. Candidates for a future rule.']
];
const A = s => new RegExp(`^(?:${s})(?:-|$)`);
const NAME_RULES = [
  ['ubermind-doctrine', /^ubermind-(?:v\d|omega\d|52|grand|library|one-master)|^founder-(?:52|directive)|omega(?:4[6-9]|5[0-2])|resident-(?:card|principle)|^library-|^books-|^rights-and-limits|^project-instructions/],
  ['north-star-life', A('personal-civilization|personal-singularity|life|living|human-capability|experience|forecast|sovereign-decision|sovereign-cognitive|sovereign-option|sovereign-initiative|volitional|salience|sovereignty-type|free-will|present-free|freedom|ruin|reachable|n-1|n-of-1|meta-rational|epistemic|embodied|unknown|value-of-information|anti-fragility|assumption|intent|inter-sovereign|memory-sovereignty|temporal-civilization|possibility-civilization|recursion-civilization|reality-calibration|north-star|gamechanger-for-life|genesis-for-life|geographic|institutional-financial|legacy-institution|health-recommendation|recurrence|adaptive-mastery|knowledge-labyrinth|multi-generation|relationship|wessam|decision-twin|century|lifetime')],
  ['asi-research', A('nullstar|omega|c21|literal-asi|system-level-asi|private-asi|ontological|cubefree|fifth-power|fourth-power|parameterized|multiplicity|external-arithmetic|causal-compiler|causal-semantic|lawspace|targeted')],
  ['capability-genome', A('genome-extraction|external-skill|capability|external-capability|neural|avengers|uberskills|wallbreaker|native-research|missing-capability|ai-skill|find-skills|task-observer|million-repo|billion|claude-external|orchestration-capability|skill')],
  ['genesis-frontier', A('temporal|emerging|growth-graph|pre-future|genesis|perpetual|gamechanger|moonshot|moonshots|founder-moonshot|founder-890|million|zero-day|future-primitive|artificial|uber-genesis|source-genesis|task-universe|thread|timeline|bounded|mechanism|constraint|noetic|interstellar|possibility|connectome|cognitive-matter')],
  ['self-maintenance', A('owned-target|governance-organ|organism|supporting-civilization|integration-smoke|separate-services|self|uberbond-self-maintainer|github-actions|github-self|linux-self|recursive|constitution|constitutional|mutation|failure-to-patch|uberdna|code|sandbox|claude-code-sandbox|verifier|audit|secret|security|composed|effect|consequence|coverage|readiness|reachability|organ|harness|check|syntax|run-tests|test|lint|semantic-test')],
  ['governance-proof', A('omnia|v7|consent|proof|evidence|policy|external-reality|external-proof|authority|supplier|institution|founder-exception|robust|shadow|live-activation|content-addressed|data-minimization|benchmark-evidence|provable|reservation')],
  ['email-infrastructure', A('uberwarm2?|winnr|uberwinnr|ubermail|uberdoso|ubermaildoso|uberdns|dns|domain|mailhub|uberinbox|uberinboxes|uberclayinbox|uberimap|ubersmtp|warmup|uberfleet|uberegress|egress|uberplacement|uberreputation|uberworm|reserved|uberquality|uberattention|fixed-host|coldmailserver|emailpal|sender|sending|deliverability')],
  ['outreach-distribution', A('omnichannel|voice|form|social|external-crm|zero-barrier|ultimate-cold|outreach|outbound|uberoutbound|uberreach|uberreply|prospect|lead|leadgen|uberlead|contact|contacts|recipient|reply|send|distribution|lawful|governed|postal|uberpostal|unsubscribe|invited|profile|uberprospect|uberlookalike|uberverify|ubersupply|ubertruth|ubereconomics|uberbuy|free-first|frozen|buyer|inbound|gmail|agentmail|messaging|discovery|enrichment|cold|instantly|async|offer-quartet|00-outreach|copy|dossier|sample-prospects')],
  ['commerce-payments', A('inquiry|verified-defects|visual-qa|review-probes|powerhouse|halfteck|forward-first|purchase|causal-attribution|future-capital|profit|wealth|scoreboard|payment|payments|paypal|billing|commercial|revenue|offer|first|money|service|delivery|fulfillment|proposal|receivables|invoice|accounting|capital|economic|universal|eight|synthetic|partner|pre-customer|programmatic|creator|business|gspot|technology|portable-paypal|booking|contra|staging|single|total-commercial|uberbond-total-commercial|machiavelli|inevitability|lite|cash|pricing|ai-automation')],
  ['opportunity-intelligence', A('opportunity|opportunities|market|prometheus|event|world|web|browser|public|crawl|ai-access|quant|competitor|company|companies|egypt|corporate|robots|overpass|approved-source|data|document|cost|research')],
  ['frontier-cognition', A('frontier|ubermind|infinite|crown|jev|openrouter|open|model|apex|sandwich|semantic|terminal|cognition|cognitive|unified|reasoning|absolute|achieved|certified|decision|system-one|native|vercel-ai|openai|anthropic|claude|invariant|compound|cross|transfer|epoch|elite|interpretation|finite|canonical|execution|mission|typingmind|remaining|pipeline|resource|gemini')],
  ['agent-mesh-autonomy', A('agent|apotheosis|autonomy|autonomous|ai|uber-socket|uber-orchestration|orchestration|relay|uberrelay|github|cloud|chatgpt|pending|durable|scheduler|queue|job|worker|founder-outcome|ghost|uberswarm|enterprise|overnight|night|nightfall|argus|hourly|uberagent|live-bridge')],
  ['continuity-memory', A('summit|pr-queue|pr-reconcile|pr\\d+|branch-hygiene|today-closure|work-session|work|account-activation|active-mission|gpt|phoenix|uberbond|context|memory|repository|current|chat|cross-chat|project|handoff|checkpoint|brain|total-brain|historical|universal-context|whole|ai-start|start-here|agents|canon|no|stop|core|final|astra')],
  ['founder-operations', A('founder|command|autonomy-command|kilimanjaro|operator|owner|system|blackout|reality-activation|recovery|limitations|architecture|launch|next-steps')],
  ['sovereign-infra', A('source-repository|source-root|disposable|hydrate|prepare|with-real|seed|contabo|live-infrastructure|kernel|state-engine|generation|sovereign|uber|compute|ubercel|ubercloud|uberocean|uberlit|uberlaunch|uberstatic|ubersubstrate|uberdepin|ubergrant|uberzero|uberwatt|uberos|oracle|free|host|embedded|postgres|database|store|runtime|provider|deploy|deployment|vercel|green|global|http|artifact|artifacts|json|csv|crypto|config|utils|build|verify|smoke|probe|migrate|install|configure|bootstrap|activate|init|rollback|import|docker|dockerfile|render|railway|server|portable|soak|cloudflare|environment|package|adapter|input|resolve')]
];
const CONTAINS_RULES = [
  [/uberwarm|winnr|mailbox|dns/, 'email-infrastructure'],
  [/outreach|cold-email|prospect/, 'outreach-distribution'],
  [/jev|uberlit|opus|openrouter|ubermind|cognition/, 'frontier-cognition'],
  [/postgres|deploy|runtime/, 'sovereign-infra'],
  [/payment|revenue|offer|contra/, 'commerce-payments']
];
const PATH_OVERRIDE = [
  [/^(docs\/forensics|artifacts\/recovery|historical-archive|docs\/history|docs\/archive)\//, 'history-forensics'],
  [/^(library|mind activation)\//, 'ubermind-doctrine'],
  [/^open router\//, 'frontier-cognition'],
  [/^(winnr|services\/uberwarm[^/]*)\//, 'email-infrastructure'],
  [/^(src\/omnia-v9|artifacts\/omnia-v9|policy\/omnia-v9)\//, 'governance-proof'],
  [/^(\.claude|\.codex|\.cursor|plugins|skill-observations|integrations)\//, 'capability-genome'],
  [/^(artifacts\/(nullstar|inevitability)[^/]*)\//, 'asi-research'],
  [/^lite\//, 'commerce-payments']
];
const PATH_FALLBACK = [
  [/^(src|tests)\/overnight|^artifacts\/(night|overnight)|^docs\/overnight|^relay\/|^tools\//, 'agent-mesh-autonomy'],
  [/^docs\/(handoffs|memory|checkpoints)\//, 'continuity-memory'],
  [/^docs\/(outreach|distribution|lead-generation)\/|^artifacts\/(outreach|outbound)/, 'outreach-distribution'],
  [/^docs\/opportunities\/|^data\//, 'opportunity-intelligence'],
  [/^artifacts\/(genesis|research)\//, 'genesis-frontier'],
  [/^artifacts\/capability-genome\//, 'capability-genome'],
  [/^(ops|deploy|migrations|runtime|uberos|services|apps|actors|api|\.github)\//, 'sovereign-infra'],
  [/^public\//, 'founder-operations'],
  [/^(artifacts\/(sovereign|uberos)|src\/uberos)\//, 'sovereign-infra'],
  [/^artifacts\/v7\//, 'governance-proof'],
  [/^(artifacts|docs)\/constitution\//, 'self-maintenance'],
  [/^artifacts\/(machiavelli|revenue-singularity)\//, 'commerce-payments'],
  [/^artifacts\/(world-brain[^/]*|quant-lab)\//, 'opportunity-intelligence'],
  [/^docs\/(prompts|work|missions|reports)\//, 'continuity-memory']
];

export function normaliseName(file) {
  return path.posix.basename(file).toLowerCase().replace(/\.test(?=\.)/, '').replace(/\.[a-z0-9]+$/, '')
    .replace(/[_\s.]+/g, '-').replace(/^-+/, '');
}
export function classifyDomain(file) {
  for (const [re, id] of PATH_OVERRIDE) if (re.test(file)) return id;
  const name = normaliseName(file);
  for (const [id, re] of NAME_RULES) if (re.test(name)) return id;
  for (const [re, id] of CONTAINS_RULES) if (re.test(name)) return id;
  for (const [re, id] of PATH_FALLBACK) if (re.test(file)) return id;
  return 'core-misc';
}

// ---------------------------------------------------------------- projects
// Named programs. Unlike domains, membership is by keyword anywhere in the path and a file may
// belong to several projects. Each project gets one self-contained context page.
const PROJECT_DIR = 'docs/projects';
const FROZEN_RE = /^(docs\/forensics|artifacts\/recovery|historical-archive|docs\/history|docs\/archive)\//;
const PROJECT_CONFIG = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'repository-projects.json'), 'utf8'));
// Tuple shape: [id, title, description, pathRegex, family, mentionsRegex|null]
export const PROJECTS = PROJECT_CONFIG.projects.map(p => [p.id, p.title, p.description, new RegExp(p.path), p.family, p.mentions ? new RegExp(p.mentions, 'g') : null]);
const MENTION_MIN = 3;
export function projectsFor(file) {
  const key = file.toLowerCase().replace(/[_\s]+/g, m => (m.includes(' ') ? ' ' : '-'));
  return PROJECTS.filter(p => p[3].test(key)).map(p => p[0]);
}

// ---------------------------------------------------------------- areas
export const AREAS = [
  ['root', 'Repository root', 'Entry points, constitutions, server/worker processes and platform manifests.'],
  ['src', 'src/ — source modules', 'Flat ES-module library; one mechanism per file, grouped here by domain. Imported by server, worker, scripts and tests.'],
  ['tests', 'tests/ — test suite', 'node:test files, almost all named after the src module or seam they cover. Run with `npm run test:deterministic`.'],
  ['scripts', 'scripts/ — CLIs and doctors', 'Command-line entry points; most are wired to an `npm run` name shown beside them.'],
  ['docs', 'docs/ — canon, handoffs, receipts', 'Human-readable canon, architecture, handoffs, receipts, prompts and forensics.'],
  ['artifacts', 'artifacts/ — machine-readable state and evidence', 'JSON registries, receipts, research corpora and recovered history.'],
  ['config', 'config/', 'Checked-in configuration and registries read by src and scripts.'],
  ['api', 'api/', 'Serverless route handlers (Vercel-style).'],
  ['public', 'public/', 'Browser assets: command center, admin and constellation UI.'],
  ['ops', 'ops/', 'Host installation, systemd units and operator shell scripts for the self-hosted stack.'],
  ['open router', 'open router/', 'Frontier-Max / Infinite Opus canon folder (numbered documents and reference code).'],
  ['library', 'library/', 'UberMind grand library: manifests, founder 52-concept sources, project-instruction copies.'],
  ['lite', 'lite/', 'Standalone "cash engine lite" app. Do not touch without a separately justified mission.'],
  ['.github', '.github/', 'CI workflows and their runtime helpers.'],
  ['.claude', '.claude/', 'Claude Code project instructions, skills, agents and settings.'],
  ['services', 'services/', 'Separately deployed small services (UberWarm callbacks, Neon functions).'],
  ['migrations', 'migrations/', 'SQL schema migrations.'],
  ['other', 'Other top-level directories', 'Small standalone packages and data: actors, apps, data, deploy, integrations, mind activation, operator-tools, plugins, policy, relay, runtime, schemas, skill-observations, tools, uberos, winnr, historical-archive.']
];
const AREA_IDS = new Set(AREAS.map(a => a[0]));
export function classifyArea(file) {
  if (!file.includes('/')) return 'root';
  const top = file.slice(0, file.indexOf('/'));
  return AREA_IDS.has(top) ? top : 'other';
}

const ROOT_ROLES = {
  'README.md': 'Repository entry point; points to the North Star reading order.',
  'AI_START_HERE.md': 'Dated navigation index for AI sessions (hot pointers, not immutable truth).',
  'START_HERE.md': 'Original Revenue Engine 1.4 quick start (historical orientation).',
  'AGENTS.md': 'Session constitution for every agent: startup order, no-amputation law, authority limits.',
  'CLAUDE.md': 'Claude Code project memory and startup imports.',
  'GEMINI.md': 'Gemini pointer to the shared constitution.',
  'CLAUDE_START_V9.md': 'Short Claude start pointer for the V9 constitution.',
  'NORTH_STAR.md': 'Terminal North Star: Sovereign Cognitive Continuum.',
  'UBERBOND_CANON.md': 'Durable cross-chat canon and bootstrap prompt.',
  'UBERBOND_BOOTSTRAP.json': 'Machine bootstrap: canonPointers every session must read.',
  'UBERBOND_ORCHESTRATION_CHECKPOINTS.md': 'Founder orchestration packets P00-P49 and continuation rules.',
  'UBERBOND_NIGHT_WAR_FINAL.md': 'Night War final mission record referenced by the current handoff.',
  'PRIVATE_ASI_STATUS.md': 'Private internal milestone status (not an external ASI claim).',
  'NEXT_STEPS.md': 'Outreach next steps consumed by the outreach drift doctor.',
  '00_OUTREACH_NOW.md': 'Current commercial/outreach hot pointer.',
  '00_OUTREACH_NOW.json': 'Machine pair of the outreach hot pointer.',
  'server.mjs': 'Web process entry point.',
  'server-core.mjs': 'HTTP routing and handlers used by server.mjs.',
  'worker.mjs': 'Queue worker process entry point.',
  'portable-server.mjs': 'Portable/self-host server entry used by the sovereign Docker images.',
  'soak-probe.mjs': 'Soak-test probe.',
  'center.html': 'Founder center page.',
  'renaissance.html': 'Standalone Renaissance page.',
  'package.json': 'Dependencies and every `npm run` command.',
  'vercel.json': 'Vercel routes, functions and crons.',
  'render.yaml': 'Render blueprint (web + worker).',
  'railway.json': 'Railway web service config.',
  'railway-worker.json': 'Railway worker service config.',
  'docker-compose.yml': 'Local/portable compose stack.',
  'docker-compose.sovereign.yml': 'Sovereign self-host compose stack.',
  '.env.example': 'Environment variable template (no secrets).',
  '.mcp.json': 'Project MCP server registration.',
  'sample-prospects.csv': 'Sample prospect import file.'
};

// ---------------------------------------------------------------- extraction
const clip = (s, n = 150) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
const DATE_RE = /(20\d{2})[-_]?(0[1-9]|1[0-2])[-_]?(0[1-9]|[12]\d|3[01])(?!\d)/;
export function dateFromName(file) { const m = path.posix.basename(file).match(DATE_RE); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; }

export function describe(file, text) {
  const ext = path.posix.extname(file).toLowerCase();
  if (text == null) return '';
  if (ext === '.md' || ext === '.mdc' || ext === '.txt') {
    const lines = text.split('\n', 60);
    const head = lines.find(l => /^#{1,3}\s+\S/.test(l)) ?? lines.find(l => l.trim() && !/^(---|<!--|>)/.test(l.trim()));
    const status = lines.find(l => /^\**(status|truth class)\**\s*:/i.test(l.trim()));
    const title = head ? head.replace(/^#+\s*/, '').replace(/[*`]/g, '') : '';
    return clip(status ? `${title} — ${status.replace(/[*`]/g, '').trim()}` : title, 190);
  }
  if (ext === '.json') {
    const pick = k => { const m = text.slice(0, 20000).match(new RegExp(`"${k}"\\s*:\\s*"([^"\\n]{2,200})"`)); return m ? m[1] : null; };
    const parts = [pick('title') ?? pick('canonicalName') ?? pick('name'), pick('status') ?? pick('truthClass'), pick('schemaVersion') ?? pick('schema')].filter(Boolean);
    return clip(parts.join(' · ') || (pick('description') ?? ''));
  }
  if (/^\.(mjs|js|cjs|ts|tsx)$/.test(ext)) {
    const body = text.replace(/^#!.*\n/, '');
    const c = body.match(/^\s*(?:\/\/\s?(.+)|\/\*\*?\s*([\s\S]*?)\*\/)/);
    if (c) { const s = (c[1] ?? c[2]).replace(/^\s*\*\s?/gm, '').trim(); if (s && !/^(eslint|@ts-|prettier|secret-scanner)/.test(s)) return clip(s); }
    if (/\.test\.[a-z]+$/.test(file)) {
      const n = (body.match(/^\s*(?:test|it)(?:\.\w+)?\(/gm) ?? []).length;
      const first = body.match(/(?:test|it|describe)\(\s*['"`]([^'"`\n]{4,})/);
      return clip(`${n} test${n === 1 ? '' : 's'}${first ? ` — e.g. "${first[1]}"` : ''}`);
    }
    const ex = [...body.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|class|let)\s+([A-Za-z0-9_$]+)/gm)].map(m => m[1]);
    if (ex.length) return clip(`exports ${ex.slice(0, 5).join(', ')}${ex.length > 5 ? ` (+${ex.length - 5})` : ''}`);
    return '';
  }
  if (ext === '.yml' || ext === '.yaml') { const m = text.match(/^name:\s*(.+)$/m); return m ? clip(m[1].replace(/^['"]|['"]$/g, '')) : ''; }
  if (ext === '.sql' || ext === '.sh' || ext === '.service' || /dockerfile/i.test(file)) {
    const m = text.split('\n', 12).find(l => /^\s*(--|#)\s*\S/.test(l) && !/^#!/.test(l));
    return m ? clip(m.replace(/^\s*(--|#)\s*/, '')) : '';
  }
  if (ext === '.html') { const m = text.match(/<title>([^<]+)<\/title>/i); return m ? clip(m[1]) : ''; }
  return '';
}

// ---------------------------------------------------------------- build
function git(root, args) { return execFileSync('git', args, { cwd: root, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' }); }
const isGenerated = f => f.startsWith(`${OUT_DIR}/`) || f === OUT_JSON || f === 'REPOSITORY_INDEX.md' || f.startsWith(`${PROJECT_DIR}/`);
const TEXT_RE = /\.(mjs|js|cjs|ts|tsx|json|md|mdc|txt|yml|yaml|sql|sh|service|html)$|(^|\/)Dockerfile/i;

export function buildIndex(root) {
  const tracked = git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
  const files = tracked.filter(f => !isGenerated(f) && fs.existsSync(path.join(root, f))).sort();
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const npmByScript = new Map();
  for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
    for (const m of String(cmd).matchAll(/(?:^|\s)((?:scripts|tests|src)\/[\w./-]+\.mjs)/g)) {
      if (!m[1].startsWith('tests/') || String(cmd).split(/\s+/).filter(t => t.startsWith('tests/')).length === 1) {
        if (!npmByScript.has(m[1])) npmByScript.set(m[1], []);
        npmByScript.get(m[1]).push(name);
      }
    }
  }
  const tests = new Set(files.filter(f => f.startsWith('tests/')));
  const inbound = new Map();
  const entries = [];
  for (const file of files) {
    const abs = path.join(root, file);
    const bytes = fs.statSync(abs).size;
    const text = TEXT_RE.test(file) && bytes <= MAX_READ ? fs.readFileSync(abs, 'utf8') : null;
    if (text && /\.(mjs|js|cjs)$/.test(file)) {
      for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1]));
        if (target.startsWith('src/') && !file.startsWith('tests/')) inbound.set(target, (inbound.get(target) ?? 0) + 1);
      }
    }
    const e = { path: file, area: classifyArea(file), domain: classifyDomain(file), bytes };
    const projects = projectsFor(file); if (projects.length) e.projects = projects;
    if (text && /\.(md|txt)$/.test(file) && !FROZEN_RE.test(file)) {
      const mentions = {};
      for (const p of PROJECTS) if (p[5] && !projects.includes(p[0])) { const n = (text.match(p[5]) ?? []).length; if (n >= MENTION_MIN) mentions[p[0]] = n; }
      if (Object.keys(mentions).length) e.mentions = mentions;
    }
    const desc = e.area === 'root' && ROOT_ROLES[file] ? ROOT_ROLES[file] : describe(file, text);
    if (desc) e.title = desc;
    const date = dateFromName(file); if (date) e.date = date;
    if (npmByScript.has(file)) e.npm = npmByScript.get(file).slice(0, 4);
    if (file.startsWith('src/') && /\.mjs$/.test(file)) {
      const t = `tests/${path.posix.basename(file, '.mjs')}.test.mjs`;
      if (tests.has(t)) e.test = t;
    }
    entries.push(e);
  }
  for (const e of entries) if (e.path.startsWith('src/') && /\.mjs$/.test(e.path)) e.importedBy = inbound.get(e.path) ?? 0;
  const count = key => entries.reduce((m, e) => (m[e[key]] = (m[e[key]] ?? 0) + 1, m), {});
  return {
    schema: REPOSITORY_INDEX_SCHEMA,
    truthBoundary: 'Navigation index only. Presence here proves a file exists, not that anything is implemented, deployed, reachable at runtime or externally proven.',
    regenerate: 'npm run repo:index',
    totals: { files: entries.length, byArea: count('area'), byDomain: count('domain') },
    domains: DOMAINS.map(([id, title, description]) => ({ id, title, description })),
    areas: AREAS.map(([id, title, description]) => ({ id, title, description })),
    files: entries
  };
}

// ---------------------------------------------------------------- render
const HEADER = '<!-- GENERATED by scripts/repository-index.mjs — do not edit by hand; run `npm run repo:index`. -->\n';
const BOUNDARY = '> Navigation aid, not evidence. A listed file exists; that says nothing about whether it runs, is deployed, or has produced any external result.\n';
const rel = (from, to) => path.posix.relative(path.posix.dirname(from), to).split('/').map(encodeURIComponent).join('/');
const slug = id => id.replace(/[^a-z0-9]+/g, '-');
const areaFile = id => `${OUT_DIR}/${id === 'root' ? 'ROOT' : slug(id).replace(/^-|-$/g, '').toUpperCase()}.md`;
const domainTitle = Object.fromEntries(DOMAINS.map(d => [d[0], d[1]]));

function line(e, from, { showDir = false } = {}) {
  const label = showDir ? e.path : path.posix.basename(e.path);
  const bits = [];
  if (e.date) bits.push(e.date);
  if (e.title) bits.push(e.title.replace(/\|/g, '/'));
  const meta = [];
  if (e.test) meta.push('tested');
  if (e.importedBy != null) meta.push(e.importedBy ? `imported by ${e.importedBy}` : 'no static importers');
  if (e.npm) meta.push(`npm: ${e.npm.map(n => `\`${n}\``).join(', ')}`);
  return `- [\`${label}\`](${rel(from, e.path)})${bits.length ? ` — ${bits.join(' · ')}` : ''}${meta.length ? ` _(${meta.join('; ')})_` : ''}`;
}

function renderArea(index, [id, title, description]) {
  const out = areaFile(id);
  const list = index.files.filter(e => e.area === id);
  const L = [HEADER, `# ${title}`, '', description, '', BOUNDARY, `**${list.length} files.** [Back to the master index](${rel(out, 'REPOSITORY_INDEX.md')})`, ''];
  const subdirOf = e => { const parts = e.path.split('/'); return id === 'other' ? parts[0] : parts.length > 2 ? parts.slice(1, 2).join('/') : ''; };
  const bySub = id === 'docs' || id === 'artifacts' || id === 'other';
  if (id === 'root') {
    L.push('| File | Role |', '|---|---|');
    for (const e of list) L.push(`| [\`${e.path}\`](${rel(out, e.path)}) | ${(e.title ?? '').replace(/\|/g, '/')} |`);
    L.push('', `Legacy root documents (July-era launch guides and mission reports) now live in [\`${LEGACY_DIR}\`](${rel(out, `${LEGACY_DIR}README.md`)}).`);
    return [out, `${L.join('\n')}\n`];
  }
  const groups = new Map();
  for (const e of list) {
    const key = bySub ? (subdirOf(e) || '(top level)') : e.domain;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const keys = bySub ? [...groups.keys()].sort((a, b) => (a === '(top level)') - (b === '(top level)') || a.localeCompare(b))
    : DOMAINS.map(d => d[0]).filter(k => groups.has(k));
  L.push('## Sections', '');
  for (const k of keys) L.push(`- [${bySub ? k : domainTitle[k]}](#${slug((bySub ? k : domainTitle[k]).toLowerCase())}) — ${groups.get(k).length}`);
  for (const k of keys) {
    L.push('', `## ${bySub ? k : domainTitle[k]}`, '');
    const g = groups.get(k);
    if (bySub && g.length > 12) {
      const sub = new Map();
      for (const e of g) { if (!sub.has(e.domain)) sub.set(e.domain, []); sub.get(e.domain).push(e); }
      for (const d of DOMAINS.map(x => x[0]).filter(x => sub.has(x))) {
        L.push(`**${domainTitle[d]}**`, '');
        for (const e of sub.get(d)) L.push(line(e, out, { showDir: e.path.split('/').length > (id === 'other' ? 2 : 3) }));
        L.push('');
      }
    } else for (const e of g) L.push(line(e, out, { showDir: e.path.split('/').length > 2 }));
  }
  return [out, `${L.join('\n').replace(/\n{3,}/g, '\n\n')}\n`];
}

function renderDomains(index) {
  const out = `${OUT_DIR}/DOMAINS.md`;
  const L = [HEADER, '# Domains — everything about one subject, across folders', '', BOUNDARY,
    'Each file is assigned to exactly one domain by ordered name/path rules in `scripts/repository-index.mjs`. The assignment is a filing convention, not an architectural claim.', '',
    `[Back to the master index](${rel(out, 'REPOSITORY_INDEX.md')})`, ''];
  for (const [id, title, description] of DOMAINS) {
    const list = index.files.filter(e => e.domain === id);
    if (!list.length) continue;
    const by = a => list.filter(e => e.area === a);
    L.push(`## ${title}`, '', description, '', `**${list.length} files** — ` + AREAS.map(a => [a, by(a[0]).length]).filter(x => x[1])
      .map(([a, n]) => `[${a[0]} ${n}](${rel(out, areaFile(a[0]))})`).join(' · '), '');
    const hubs = by('src').filter(e => e.importedBy).sort((a, b) => b.importedBy - a.importedBy || a.path.localeCompare(b.path)).slice(0, 8);
    if (hubs.length) L.push(`Most-imported modules: ${hubs.map(e => `[\`${path.posix.basename(e.path, '.mjs')}\`](${rel(out, e.path)}) (${e.importedBy})`).join(', ')}`, '');
    const docs = list.filter(e => /\.md$/.test(e.path) && (e.area === 'docs' || e.area === 'root') && !/\/(forensics|receipts)\//.test(e.path))
      .sort((a, b) => (/CANON|NORTH_STAR|ARCHITECTURE/.test(b.path) - /CANON|NORTH_STAR|ARCHITECTURE/.test(a.path)) || (b.date ?? '').localeCompare(a.date ?? '') || a.path.localeCompare(b.path)).slice(0, 8);
    if (docs.length) { L.push('Key documents (canon first, then newest):', ''); for (const e of docs) L.push(line(e, out, { showDir: true })); L.push(''); }
    const cmds = [...new Set(list.flatMap(e => e.npm ?? []))].sort().slice(0, 14);
    if (cmds.length) L.push(`Commands: ${cmds.map(c => `\`npm run ${c}\``).join(' · ')}`, '');
  }
  return [out, `${L.join('\n')}\n`];
}

function renderMaster(index) {
  const out = 'REPOSITORY_INDEX.md';
  const t = index.totals;
  const link = (p, label = p) => `[\`${label}\`](${rel(out, p)})`;
  const L = [HEADER, '# UberBond repository index', '', BOUNDARY,
    `**${t.files} tracked files**, catalogued by folder and by subject. This page is the map; the linked pages list every file with a one-line description.`, '',
    '## 1. Read first', '',
    `1. ${link('README.md')} → ${link('NORTH_STAR.md')} → ${link('AGENTS.md')} → ${link('CLAUDE.md')} → ${link('UBERBOND_CANON.md')} → ${link('UBERBOND_BOOTSTRAP.json')}`,
    `2. Whole-organism memory: ${link('docs/UBERBOND_TOTAL_BRAIN.md')}, ${link('docs/UBERBOND_MASTER_MEMORY.md')}`,
    `3. Present state: ${link('docs/CURRENT_HANDOFF.json')}, ${link('docs/CURRENT_SYSTEM_STATE.md')}, \`npm run brain\``,
    `4. Founder 890 corpus: ${link('docs/FOUNDER_890_UNIVERSAL_CROSS_CHAT_INTEGRATION.md')}`, '',
    '## 2. Browse by folder', '', '| Folder | Files | What it holds |', '|---|---:|---|'];
  for (const a of AREAS) if (t.byArea[a[0]]) L.push(`| [${a[1]}](${rel(out, areaFile(a[0]))}) | ${t.byArea[a[0]]} | ${a[2]} |`);
  L.push('', '## 3. Browse by subject', '', `Full detail with key documents, hub modules and commands: ${link(`${OUT_DIR}/DOMAINS.md`, 'docs/index/DOMAINS.md')}`, '',
    '| Domain | Files | Scope |', '|---|---:|---|');
  for (const d of DOMAINS) if (t.byDomain[d[0]]) L.push(`| [${d[1]}](${rel(out, `${OUT_DIR}/DOMAINS.md`)}#${slug(d[1].toLowerCase())}) | ${t.byDomain[d[0]]} | ${d[2]} |`);
  L.push('', '## 4. Conventions that make the flat folders navigable', '',
    '- `src/<name>.mjs` is tested by `tests/<name>.test.mjs` and, where a CLI exists, driven by `scripts/<name>.mjs` or `scripts/<name>-doctor.mjs`. The first word of the name is its program (`uberwarm2-…`, `genesis-…`, `capability-genome-…`).',
    '- Documents carry their date in the filename (`…_2026-09-30.md`); undated documents are standing canon.',
    '- `docs/receipts/`, `docs/forensics/` and `artifacts/recovery/` are frozen records. They quote historical paths on purpose and are never rewritten.',
    `- Legacy root documents moved on 2026-11-14 are listed with their old names in ${link(`${LEGACY_DIR}README.md`)}.`,
    '- Source, tests and scripts were deliberately **not** moved into subfolders: about 3,000 import paths, 249 npm scripts, CI workflows, Docker images and startup pointers depend on the current paths.', '',
    '## 5. Keeping this current', '',
    '`npm run repo:index` rewrites this page, `docs/index/*.md` and `artifacts/repository-index/index.json` (machine-readable, one record per file). `npm run repo:index:check` exits non-zero when they are stale. New name prefixes land in "Core and uncategorised" until a rule is added to `NAME_RULES`.', '');
  return [out, `${L.join('\n')}\n`];
}

function renderProjects(index) {
  const outs = [];
  const readme = `${PROJECT_DIR}/README.md`;
  const R = [HEADER, '# Projects — one context page per program', '', BOUNDARY,
    'Each page below gathers everything that belongs to one named program: what it is, what to read first, the latest dated documents, then every source module, script, test and data file. A file can appear on several pages.', '',
    '## For ChatGPT and other assistants', '',
    'When asked about a specific UberBond project, open its page here first and follow its "Read first" list before answering. Paste this line into Project instructions:', '',
    '> For any question about a specific UberBond project (Outreach, UberMind, PHOENIX, UberWarm, GENESIS, ...), first open `docs/projects/README.md` in `mohammedwessam2007/uberbondd`, then the matching `docs/projects/<project>.md`, and read its "Read first" documents before answering. Treat the page as navigation; verify present-tense claims against current code and receipts.', '',
    `**${PROJECTS.length} projects** in ${new Set(PROJECTS.map(p => p[4])).size} families. The roster lives in \`config/repository-projects.json\`; add a program there and run \`npm run repo:index\`.`, ''];
  let family = null;
  for (const [id, title, description, , fam] of PROJECTS) {
    const out = `${PROJECT_DIR}/${id}.md`;
    const all = index.files.filter(e => e.projects?.includes(id));
    if (!all.length) continue;
    if (fam !== family) { family = fam; R.push('', `### ${fam}`, '', '| Project | Files | What it is |', '|---|---:|---|'); }
    R.push(`| [${title}](${rel(readme, out)}) | ${all.length} | ${description} |`);
    const live = all.filter(e => !FROZEN_RE.test(e.path));
    const isDoc = e => /\.(md|txt)$/.test(e.path);
    const docs = live.filter(isDoc);
    const rank = e => (/CANON|NORTH_STAR|PROTOCOL|ARCHITECTURE/.test(e.path) ? 0 : /^(docs\/[^/]+|[^/]+)$/.test(e.path) ? 1 : /README/.test(e.path) ? 2 : 3);
    const canon = docs.filter(e => /\.md$/.test(e.path) && !e.date && !/\/(receipts|prompts|handoffs|memory)\//.test(e.path))
      .sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
    const dated = docs.filter(e => e.date).sort((a, b) => b.date.localeCompare(a.date) || a.path.localeCompare(b.path));
    const first = [...canon.slice(0, 8), ...dated.slice(0, 6)];
    const firstSet = new Set(first);
    const src = live.filter(e => e.area === 'src' || (e.area === 'root' && /\.mjs$/.test(e.path)));
    const scripts = live.filter(e => e.area === 'scripts');
    const tests = live.filter(e => e.area === 'tests');
    const taken = new Set([...docs, ...src, ...scripts, ...tests]);
    const rest = live.filter(e => !taken.has(e));
    const cmds = [...new Set(live.flatMap(e => e.npm ?? []))].sort();
    const L = [HEADER, `# ${title}`, '', description, '', BOUNDARY,
      `**${all.length} files** match this project by name. [All projects](${rel(out, readme)}) · [Master index](${rel(out, 'REPOSITORY_INDEX.md')})`, '',
      'Before present-tense claims, also check `docs/CURRENT_HANDOFF.json` and `docs/CURRENT_SYSTEM_STATE.md`; dated documents describe their date, not today.', ''];
    const section = (h, items, opts = {}) => { if (items.length) { L.push(`## ${h} (${items.length})`, ''); for (const e of items) L.push(line(e, out, { showDir: true, ...opts })); L.push(''); } };
    section('Read first', first);
    if (cmds.length) L.push(`## Commands (${cmds.length})`, '', cmds.map(c => `\`npm run ${c}\``).join(' · '), '');
    section('Standing documents', canon.filter(e => !firstSet.has(e)));
    section('Dated documents, newest first', dated.filter(e => !firstSet.has(e)));
    section('Other documents', docs.filter(e => !firstSet.has(e) && !canon.includes(e) && !dated.includes(e)));
    const discuss = index.files.filter(e => e.mentions?.[id]).sort((a, b) => b.mentions[id] - a.mentions[id] || a.path.localeCompare(b.path)).slice(0, 40);
    if (discuss.length) { L.push(`## Documents that discuss this project without naming it in the filename (${discuss.length})`, ''); for (const e of discuss) L.push(`${line(e, out, { showDir: true })} _(${e.mentions[id]} mentions)_`); L.push(''); }
    section('Source modules', src);
    section('Scripts', scripts);
    section('Config, data, artifacts and services', rest);
    if (tests.length) L.push(`## Tests (${tests.length})`, '', tests.map(e => `[\`${path.posix.basename(e.path, '.test.mjs')}\`](${rel(out, e.path)})`).join(' · '), '');
    const frozen = all.length - live.length;
    if (frozen) L.push(`## Frozen history`, '', `${frozen} further matching files sit in frozen records (forensics, recovery, archives). See [history index](${rel(out, areaFile('docs'))}).`, '');
    outs.push([out, `${L.join('\n')}\n`]);
  }
  const none = index.files.filter(e => !e.projects && !FROZEN_RE.test(e.path)).length;
  R.push('', `${none} live files match no project keyword; find them through the [folder and domain index](${rel(readme, 'REPOSITORY_INDEX.md')}).`, '');
  outs.push([readme, `${R.join('\n')}\n`]);
  return outs;
}

export function renderAll(index) {
  const outputs = new Map([renderMaster(index), renderDomains(index), ...AREAS.filter(a => index.totals.byArea[a[0]]).map(a => renderArea(index, a)), ...renderProjects(index)]);
  outputs.set(OUT_JSON, `${JSON.stringify(index)}\n`);
  return outputs;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const check = process.argv.includes('--check');
  const index = buildIndex(root);
  const outputs = renderAll(index);
  const stale = [...outputs].filter(([f, body]) => !fs.existsSync(path.join(root, f)) || fs.readFileSync(path.join(root, f), 'utf8') !== body).map(x => x[0]);
  if (check) {
    console.log(stale.length ? `REPOSITORY_INDEX_STALE: ${stale.join(', ')}` : `REPOSITORY_INDEX_CURRENT: ${index.totals.files} files`);
    process.exit(stale.length ? 1 : 0);
  }
  for (const [f, body] of outputs) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), body); }
  console.log(`REPOSITORY_INDEX_WRITTEN: ${index.totals.files} files, ${outputs.size} outputs, ${stale.length} changed`);
  console.log(Object.entries(index.totals.byDomain).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '));
}
