#!/usr/bin/env node
// Bounded internal bridge from UberBond's Node workflow to the source-pinned
// PHOENIX research index. No donor execution, credentials, network or authority.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const fail = (reason) => {
  console.error(JSON.stringify({ ok: false, status: 'PHOENIX_RESEARCH_QUERY_REFUSED', reason }));
  process.exitCode = 1;
};
if (argv.length === 0 || argv.length > 2 || !argv[0]?.trim() || argv[0].length > 200) {
  fail('QUERY_REQUIRED_MAX_200_CHARACTERS');
} else {
  const limit = argv.length === 2 ? Number(argv[1]) : 10;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    fail('LIMIT_OUT_OF_BOUNDS');
  } else {
    const args = [resolve(root, 'scripts/phoenix-ten-wave-genome-doctor.py'), '--query', argv[0], '--limit', String(limit)];
    const result = spawnSync('python3', args, {
      cwd: root, encoding: 'utf8', timeout: 30000,
      maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH || '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1' }
    });
    if (result.error || result.status !== 0) {
      fail('SOURCE_VERIFICATION_OR_PYTHON_FAILED');
    } else {
      try {
        const payload = JSON.parse(result.stdout);
        if (payload?.truth_class !== 'RESEARCH_ONLY_NO_INSTALL_NO_RUNTIME_NO_AUTHORITY'
            || payload?.recovered_proposals !== 1560
            || !Array.isArray(payload?.matches)
            || payload.matches.some(x => x.promotion_authority !== 'NONE')) {
          fail('INVALID_SOURCE_LINKED_QUERY_RESULT');
        } else {
          console.log(JSON.stringify({
            ok: true, status: 'PHOENIX_SOURCE_LINKED_RESEARCH_ONLY',
            query: argv[0], count: payload.matches.length,
            universe: payload.recovered_proposals,
            missing_wave4: payload.wave4_unrecovered_proposal_count,
            matches: payload.matches,
            promotion_authority: 'NONE', external_effects: 'NONE'
          }, null, 2));
        }
      } catch {
        fail('RESEARCH_RESULT_INVALID_JSON');
      }
    }
  }
}
