#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { compileAutonomyCommand, helpMarkdown, statusMarkdown } from '../src/autonomy-command-center-control.mjs';
import { buildAutonomyCommandCenterStatus } from '../src/autonomy-command-center-status.mjs';

const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

async function appendOutput(name, value) {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) return;
  await fs.appendFile(target, `${name}=${String(value).replaceAll('\n', ' ')}\n`, 'utf8');
}

async function main({ env = process.env, root = process.cwd(), now = new Date() } = {}) {
  const plan = compileAutonomyCommand({
    body: env.COMMAND_BODY,
    actor: env.COMMAND_ACTOR,
    repositoryOwner: env.REPOSITORY_OWNER,
    authorAssociation: env.AUTHOR_ASSOCIATION,
    issueNumber: env.ISSUE_NUMBER
  });
  if (!plan.ok) {
    await appendOutput('authorized', 'false');
    await appendOutput('action', 'NO_OP');
    console.error(JSON.stringify(plan));
    process.exitCode = 2;
    return;
  }

  const paused = String(env.UBERBOND_PAUSED || '').toLowerCase() === 'true';
  const sourceCommit = text(env.SOURCE_COMMIT, 80) || null;
  let response;
  if (plan.action === 'REPORT_STATUS') {
    const status = await buildAutonomyCommandCenterStatus({ root, now, sourceCommit });
    response = statusMarkdown({ status, paused, sourceCommit });
  } else if (plan.action === 'REPORT_HELP') {
    response = helpMarkdown();
  } else if (plan.action === 'PAUSE_NEW_PULSES') {
    response = '### UberBond finite-completion loop\n\nPause fence requested. New scheduled/manual completion pulses will be blocked after the durable issue label is applied. Existing evidence and continuation state are preserved.';
  } else if (plan.action === 'RESUME_AND_DISPATCH_WAKE') {
    response = '### UberBond finite-completion loop\n\nResume requested. The pause fence will be removed and one fresh bounded completion pulse dispatched.';
  } else if (plan.action === 'DISPATCH_WAKE') {
    response = paused
      ? '### UberBond finite-completion loop\n\nWake refused because the founder pause fence is active. Use `/resume` to remove the fence and dispatch a fresh pulse.'
      : '### UberBond finite-completion loop\n\nOne bounded finite-completion pulse requested. This grants no merge, deploy, customer, payment, spend, credential, DNS, private-life, production, or ASI authority.';
  }

  const responsePath = path.join(text(env.RUNNER_TEMP, 1000) || '/tmp', 'uberbond-command-center-response.md');
  await fs.writeFile(responsePath, `${response}\n`, 'utf8');
  await appendOutput('authorized', 'true');
  await appendOutput('command', plan.command);
  await appendOutput('action', plan.action);
  await appendOutput('response_path', responsePath);
  await appendOutput('dispatch_wake', ((plan.action === 'DISPATCH_WAKE' && !paused) || plan.action === 'RESUME_AND_DISPATCH_WAKE') ? 'true' : 'false');
  await appendOutput('apply_pause', plan.action === 'PAUSE_NEW_PULSES' ? 'true' : 'false');
  await appendOutput('remove_pause', plan.action === 'RESUME_AND_DISPATCH_WAKE' ? 'true' : 'false');
  console.log(JSON.stringify({ ...plan, paused, responsePath }));
}

await main();
