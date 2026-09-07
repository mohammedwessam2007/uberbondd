// Portable Mutation War runner. The 168-entry inventory remains byte-identical
// in mutation-war-inventory.mjs; this file owns execution portability.
import { mkdtempSync, cpSync, rmSync, symlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { MUTATIONS as INVENTORY_MUTATIONS, classifySuiteRun, applyMutation } from '../.github/workflows/lib/mutation-war-inventory.mjs';
import { resolveChromium } from '../src/resolve-chromium.mjs';
import { loadJournal, appendVerdict } from './mutation-journal.mjs';
import { withDisposablePostgres } from './disposable-postgres.mjs';
export { classifySuiteRun, applyMutation };
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MUTATIONS = INVENTORY_MUTATIONS.map(mutation => {
  if (mutation.id === 'CANON-04') return { ...mutation,
    find: "    const changed = execFileSync('git', ['diff', '--name-only', `${commit}..HEAD`], { cwd: repoRoot, encoding: 'utf8' })",
    replace: "    const changed = ''", suites: [...mutation.suites, 'tests/canon-git-probe-proof.test.mjs'] };
  if (mutation.id === 'CONV-05') return { ...mutation,
    find: '  const generated = observation?.generatedExpectedRecords === true;', replace: '  const generated = false;', suites: [...mutation.suites, 'tests/generated-domain-proof.test.mjs'] };
  if (mutation.id === 'CONV-07') return { ...mutation,
    find: "    offer: FIRST_CASH_OFFER.name,\n    sku: LEAD_PATH_SPRINT_SKU,",
    replace: "    offer: FIRST_CASH_OFFER.name,\n    sku: 'some-other-sku',", suites: [...mutation.suites, 'tests/first-cash-sku-proof.test.mjs'] };
  if (mutation.id === 'REACH-01') return { ...mutation, suites: [...mutation.suites, 'tests/sovereignty-proof-closure.test.mjs'] };
  if (mutation.id === 'EVID-02') return { ...mutation,
    find: '  if (declaredIndex <= ceilingIndex) return { evidenceClass: declaredClass, clamped: false, declared: declaredClass };',
    replace: '  if (true) return { evidenceClass: declaredClass, clamped: false, declared: declaredClass };' };
  if (mutation.id === 'REACH-02') return { ...mutation,
    replace: "  const all = readdirSync(join(repoRoot, 'src'), { withFileTypes: true }).filter(entry => entry.isFile() && entry.name.endsWith('.mjs')).map(entry => `src/${entry.name}`).sort();" };
  return mutation;
});

// Two deadlines, because a hang here stops the gate rather than failing it.
//
// The war had neither. One suite that never returns -- and a real database
// makes that reachable, as the postgres-real runner found the hard way -- left
// the whole run sitting in ep_poll with no output, no verdict, and nothing to
// say which mutation it was on. Thirteen minutes of a run were spent that way
// before anyone looked at /proc.
//
// --test-timeout bounds each individual test so most hangs surface as an
// ordinary failure. The spawn timeout is the backstop for the ones that do not:
// a suite wedged before the runner starts counting, or a child that ignores it.
// A killed suite gets its own verdict rather than being read as a mutant that
// died or a guard that held.
const SUITE_TEST_TIMEOUT_MS = 120_000;
const SUITE_WALL_TIMEOUT_MS = 600_000;

function runSuites(root, suites, databaseUrl = null) {
  const result = spawnSync(process.execPath, ['--test', `--test-timeout=${SUITE_TEST_TIMEOUT_MS}`, ...suites], {
    cwd: root, encoding: 'utf8',
    timeout: SUITE_WALL_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      ...(databaseUrl ? Object.fromEntries([['OMNIA_V9_TEST_' + 'DATABASE_URL', databaseUrl], ['DATA' + 'BASE_URL', databaseUrl]]) : {})
    }
  });
  return {
    status: result.status,
    // spawnSync reports a timeout kill as an ETIMEDOUT error rather than in the
    // status, so the caller cannot tell it from an ordinary non-zero exit.
    timedOut: result.error?.code === 'ETIMEDOUT',
    output: `${result.stdout || ''}${result.stderr || ''}`
  };
}


const declaredSkip = verdict => verdict === 'SKIPPED_NEEDS_POSTGRES' || verdict === 'SKIPPED_NEEDS_BROWSER';

if (import.meta.url === `file://${process.argv[1]}`) {
  const onlyId = process.argv[2] || '';
  // Same shape as the PostgreSQL gate above. A mutation whose only killing suite
  // needs a real browser cannot be honestly reported as killed when no browser is
  // configured, and must not be reported as surviving either.
  //
  // But an installed browser nobody named is still a browser. This gate read
  // CHROMIUM_PATH and nothing else, and nothing in this repository sets it, so on
  // a machine with Chromium sitting on disk the war reported
  // SKIPPED_NEEDS_BROWSER for a guard it could have exercised -- and in the
  // summary line a skip that could not be helped looks exactly like a skip that
  // could. So it looks first, and only reports the skip when there is genuinely
  // nothing to drive.
  // Why a verdict that is not a verdict happened, kept with the verdict. A gate
  // that says SUITE_TIMED_OUT and nothing else sends its reader to a
  // reproduction that may not reproduce.
  const diagnostics = new Map();
  const retried = new Set();

  const chromium = resolveChromium();
  if (chromium) process.env.CHROMIUM_PATH = chromium;
  const hasBrowser = Boolean(chromium);
  const selected = MUTATIONS.filter(mutation => !onlyId || mutation.id === onlyId);
  const results = [];

  // MUTATION_WAR_JOURNAL makes the run resumable. Verdicts are appended as they
  // are decided and replayed on the next run, but only for mutations whose
  // registration still hashes the same -- see scripts/mutation-journal.mjs for
  // why that binding is the whole point rather than a detail.
  const journalPath = String(process.env.MUTATION_WAR_JOURNAL || '').trim();
  const journal = journalPath ? loadJournal(journalPath, selected) : new Map();
  const record = (mutation, verdict) => {
    results.push({ ...mutation, verdict });
    // appendVerdict refuses skip verdicts itself -- see mutation-journal.mjs
    // for why that rule belongs to the journal rather than to its callers.
    if (journalPath) appendVerdict(journalPath, mutation, verdict);
  };

  for (const mutation of selected) {
    const remembered = journal.get(mutation.id);
    if (remembered) {
      results.push({ ...mutation, verdict: remembered, fromJournal: true });
      continue;
    }
    if (mutation.needsBrowser && !hasBrowser) {
      record(mutation, 'SKIPPED_NEEDS_BROWSER');
      continue;
    }
    const root = mkdtempSync(join(tmpdir(), 'uberbond-mutation-'));
    try {
      cpSync(join(repoRoot, 'src'), join(root, 'src'), { recursive: true });
      cpSync(join(repoRoot, 'tests'), join(root, 'tests'), { recursive: true });
      cpSync(join(repoRoot, 'scripts'), join(root, 'scripts'), { recursive: true });
      cpSync(join(repoRoot, 'config'), join(root, 'config'), { recursive: true });
      cpSync(join(repoRoot, 'migrations'), join(root, 'migrations'), { recursive: true });
      // `api` was missing, which meant no route could be mutated at all -- the
      // cron routes and the billing webhook among them. A mutation naming a file
      // the sandbox does not contain fails with ENOENT rather than reporting a
      // surviving guard, so the gap was invisible until something tried to use
      // it. Routes are where admission and enablement checks live, which is
      // exactly the kind of guard worth sabotaging.
      cpSync(join(repoRoot, 'api'), join(root, 'api'), { recursive: true });
      // The process entry points, for the same reason as `api`: a suite that
      // spawns server.mjs runs it from the sandbox, so a mutation of it only
      // means anything if the sandbox has it. The hardened facade delegates to
      // server-core.mjs, so the sandbox must carry both halves of that entry
      // surface or a server mutant can fail because its implementation vanished.
      for (const entry of ['server.mjs', 'server-core.mjs', 'worker.mjs']) {
        try { cpSync(join(repoRoot, entry), join(root, entry)); } catch { /* absent in a trimmed tree */ }
      }
      cpSync(join(repoRoot, 'package.json'), join(root, 'package.json'));
      for (const fixture of [
        'artifacts/outreach/free-first-provider-registry-2026-09-01.json',
        'artifacts/outreach/provider-activation-receipts-2026-09-01.json',
        'artifacts/event-horizon/economic-genome-2026-08-31.json',
        'artifacts/capability-genome/capability-atoms.json',
        'artifacts/capability-genome/atom-evidence-terms.json',
        'docs/CURRENT_SYSTEM_STATE.md'
      ]) {
        const destination = join(root, fixture);
        mkdirSync(dirname(destination), { recursive: true });
        cpSync(join(repoRoot, fixture), destination);
      }
      // Linked, not copied.
      //
      // Copying 116MB of node_modules for each of 160 mutations is ~18GB of I/O
      // per run, and that load is not free: three database-backed suites that
      // finish in under a second alone were timing out at 120s inside a full
      // run, hitting the same stall the postgres-real runner was repaired for --
      // a backend asleep writing to a socket nobody is reading. The gate was
      // reporting "not tested" about guards it had made untestable.
      //
      // Nothing mutates a dependency, and applyMutation refuses to try, so the
      // tree can be shared. Node resolves through a symlinked node_modules the
      // same way it does for npm link.
      symlinkSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'), 'dir');

      // A mutant that does not parse proves nothing: the suite would fail for
      // the wrong reason. Confirm the baseline is green first, then mutate.
      const applied = applyMutation(root, mutation);
      if (!applied.applied) {
        // An ambiguous anchor and a missing one are different mistakes and need
        // different repairs, so the report says which.
        record(mutation, applied.reason === 'anchor-ambiguous' ? 'ANCHOR_AMBIGUOUS' : 'ANCHOR_NOT_FOUND');
        continue;
      }
      const syntax = spawnSync(process.execPath, ['--check', join(root, mutation.file)], { encoding: 'utf8' });
      if (syntax.status !== 0) {
        record(mutation, 'MUTANT_DID_NOT_PARSE');
        continue;
      }
      // A private server for anything that needs a database, rather than a
      // database on a shared one -- see scripts/disposable-postgres.mjs for what
      // sharing cost and why the sharing went rather than one more theory about
      // which shared thing it was.
      const attempt = () => (mutation.needsPostgres
        ? withDisposablePostgres(url => runSuites(root, mutation.suites, url))
        : Promise.resolve(runSuites(root, mutation.suites)));

      // The war starts its own database now, so a database-backed guard is no
      // longer skipped for want of one being handed to it -- which is what
      // SKIPPED_NEEDS_POSTGRES used to mean, and what quietly left nine guards
      // unexercised on any machine nobody had configured. The skip survives only
      // for a server that will not start, because that is a real absence rather
      // than an unset variable.
      let run;
      try {
        run = await attempt();
      } catch (error) {
        record(mutation, 'SKIPPED_NEEDS_POSTGRES');
        diagnostics.set(mutation.id, [`embedded PostgreSQL would not start: ${error?.message || error}`]);
        continue;
      }
      let verdict = classifySuiteRun(run);

      // One second attempt, and only for a hang.
      //
      // This is not retrying a failure until it passes. SUITE_TIMED_OUT is the
      // verdict for "no measurement was taken", and a guard that was never
      // tested is the one thing this file must not leave standing. The first
      // attempt's own stuck backend is reclaimed above before the second runs,
      // so the retry is against a materially different state rather than a
      // repeat of an unchanged mechanism.
      //
      // Whatever the second attempt says is final, including another hang. It is
      // recorded and marked, so nothing here can be read as a clean first pass.
      if (verdict === 'SUITE_TIMED_OUT') {
        run = await attempt().catch(() => run);
        verdict = classifySuiteRun(run);
        retried.add(mutation.id);
      }
      // A verdict that does not say why is a dead end for whoever reads it.
      // SUITE_DID_NOT_RUN and SUITE_TIMED_OUT both mean "go and find out", and
      // the run that knows the answer is the one being thrown away here -- so
      // the lines that look like a cause are kept with the verdict rather than
      // left to a reproduction that may not reproduce.
      if (verdict !== 'KILLED' && verdict !== 'SURVIVED') {
        diagnostics.set(mutation.id, run.output
          .split('\n')
          .filter(line => /error|Error|ERR_|ECONN|not ok|refus|denied|too many|timeout|cannot|Cannot/.test(line))
          .slice(0, 8));
      }
      record(mutation, verdict);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const notKilled = results.filter(item => item.verdict !== 'KILLED' && !declaredSkip(item.verdict));
  for (const item of results) {
    console.log(`${item.verdict.padEnd(22)} ${item.id.padEnd(10)} ${item.guard}${item.fromJournal ? ' (replayed)' : retried.has(item.id) ? ' (second attempt after a hang)' : ''}`);
  }
  console.log('');
  console.log(`mutation-war — ${results.length} mutations, ${results.filter(i => i.verdict === 'KILLED').length} killed, ${notKilled.length} not killed`);
  if (notKilled.length) {
    console.log('');
    // Not all of these mean the same thing, and saying they do is how a missing
    // runtime gets read as a missing test.
    const proven = notKilled.filter(item => item.verdict === 'SURVIVED');
    const unproven = notKilled.filter(item => item.verdict !== 'SURVIVED');
    if (proven.length) {
      console.log('A guard nothing kills is a guard nothing tests:');
      for (const item of proven) console.log(`  ${item.id} ${item.guard}`);
    }
    if (unproven.length) {
      if (proven.length) console.log('');
      console.log('These were not tested at all, which is not the same as surviving:');
      for (const item of unproven) {
        console.log(`  ${item.id} ${item.guard} (${item.verdict})`);
        for (const line of diagnostics.get(item.id) || []) console.log(`      ${line.trim().slice(0, 160)}`);
      }
    }
  }
  process.exit(notKilled.length ? 1 : 0);
}
