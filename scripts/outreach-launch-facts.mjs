#!/usr/bin/env node
// One owner action: fill one facts file, then let the machine report what is missing.
//   node scripts/outreach-launch-facts.mjs --init            # writes a template to ~/.uberbond/launch-facts.json (0600)
//   node scripts/outreach-launch-facts.mjs [path]            # compiles it; exit 0 complete, 2 incomplete
// The file holds the founder's postal address; keep it outside the repository.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LAUNCH_FACTS_TEMPLATE, compileOutreachLaunchFacts } from '../src/outreach-launch-facts.mjs';

const defaultPath = path.join(os.homedir(), '.uberbond', 'launch-facts.json');
const args = process.argv.slice(2);
if (args[0] === '--init') {
  const target = args[1] || defaultPath;
  if (fs.existsSync(target)) { process.stderr.write(`refusing to overwrite ${target}\n`); process.exit(2); }
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, `${JSON.stringify(LAUNCH_FACTS_TEMPLATE, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`wrote template ${target}\n`);
} else {
  const target = args[0] || defaultPath;
  if (!fs.existsSync(target)) { process.stderr.write(`no facts file at ${target}; run with --init first\n`); process.exit(2); }
  const compiled = compileOutreachLaunchFacts(JSON.parse(fs.readFileSync(target, 'utf8')));
  process.stdout.write(`${JSON.stringify(compiled, null, 2)}\n`);
  process.exitCode = compiled.status === 'LAUNCH_FACTS_COMPLETE' ? 0 : 2;
}
