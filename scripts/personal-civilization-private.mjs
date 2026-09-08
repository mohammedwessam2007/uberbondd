import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_PRIVATE_STATE_FILE,
  founderAuthorization,
  runPrivateCommand
} from '../src/personal-civilization-private-operator.mjs';

export const PRIVATE_OPERATOR_CONFIRMATION = 'OPEN MY PRIVATE LIFE STATE';

export function founderPresenceSatisfied({ stdinIsTTY = false, stdoutIsTTY = false, confirmation = '' } = {}) {
  return stdinIsTTY === true
    && stdoutIsTTY === true
    && String(confirmation || '').trim() === PRIVATE_OPERATOR_CONFIRMATION;
}

function publicView(result, action) {
  if (!result?.ok) {
    return {
      ok: false,
      status: result?.status || 'PRIVATE_COMMAND_REFUSED',
      reasonCodes: result?.reasonCodes || ['private-command-failed'],
      businessEffectAuthority: 'NONE'
    };
  }
  if (action === 'status') return { ok: true, status: result.status, summary: result.summary, businessEffectAuthority: 'NONE' };
  if (action === 'list') return { ok: true, status: result.status, records: result.records, hypotheses: result.hypotheses, businessEffectAuthority: 'NONE' };
  if (action === 'capture') return { ok: true, status: result.status, persisted: result.persisted, recordId: result.record?.id || null, willEventType: result.willEventType, promotionBoundary: result.promotionBoundary, businessEffectAuthority: 'NONE' };
  if (action === 'hypothesis') return { ok: true, status: result.status, hypothesis: result.hypothesis, businessEffectAuthority: 'NONE' };
  if (action === 'decision') return { ok: true, status: result.status, packet: result.packet, truthBoundary: result.truthBoundary, businessEffectAuthority: 'NONE' };
  if (action === 'delete') return { ok: true, status: result.status, deletedIds: result.deletedIds, derivedAlsoDeleted: result.derivedAlsoDeleted, prunedHypothesisCount: result.prunedHypothesisCount, prunedEdgeCount: result.prunedEdgeCount, guarantee: result.guarantee, businessEffectAuthority: 'NONE' };
  if (action === 'export') return { ok: true, status: result.status, exportWritten: result.exportWritten, exportDestination: result.exportDestination, recordCount: result.recordCount, digest: result.digest, completeness: result.completeness, businessEffectAuthority: 'NONE' };
  return { ok: true, status: result.status, businessEffectAuthority: 'NONE' };
}

export async function runFounderInteractiveSession({
  stdin = input,
  stdout = output,
  privateFilePath = process.env.UBERBOND_PRIVATE_LIFE_STORE || DEFAULT_PRIVATE_STATE_FILE,
  rlFactory = options => readline.createInterface(options)
} = {}) {
  if (stdin?.isTTY !== true || stdout?.isTTY !== true) {
    return { ok: false, status: 'FOUNDER_PRESENCE_REQUIRED', reasonCodes: ['interactive-tty-required'], businessEffectAuthority: 'NONE' };
  }

  const rl = rlFactory({ input: stdin, output: stdout, terminal: true });
  try {
    stdout.write('UberBond private Personal Civilization operator. No network or autonomous entry point is authorized.\n');
    stdout.write(`Type exactly: ${PRIVATE_OPERATOR_CONFIRMATION}\n`);
    const confirmation = await rl.question('> ');
    if (!founderPresenceSatisfied({ stdinIsTTY: stdin.isTTY, stdoutIsTTY: stdout.isTTY, confirmation })) {
      return { ok: false, status: 'FOUNDER_PRESENCE_REQUIRED', reasonCodes: ['founder-confirmation-mismatch'], businessEffectAuthority: 'NONE' };
    }

    const authorization = founderAuthorization(new Date());
    if (!authorization) return { ok: false, status: 'FOUNDER_PRESENCE_REQUIRED', reasonCodes: ['authorization-clock-invalid'], businessEffectAuthority: 'NONE' };

    stdout.write('Authorized for this interactive process only. Enter one-line JSON commands. Actions: status, capture, list, hypothesis, decision, delete, export. Type quit to close.\n');
    for (;;) {
      const line = await rl.question('private> ');
      if (String(line).trim().toLowerCase() === 'quit') {
        return { ok: true, status: 'PRIVATE_SESSION_CLOSED', businessEffectAuthority: 'NONE' };
      }
      let command;
      try { command = JSON.parse(line); }
      catch {
        stdout.write(`${JSON.stringify({ ok: false, status: 'PRIVATE_COMMAND_REFUSED', reasonCodes: ['valid-json-command-required'] })}\n`);
        continue;
      }
      const action = String(command?.action || '').trim().toLowerCase();
      const result = runPrivateCommand({ command, authorization, filePath: privateFilePath });
      stdout.write(`${JSON.stringify(publicView(result, action), null, 2)}\n`);
    }
  } finally {
    rl.close();
  }
}

const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`));
if (isEntryPoint) {
  const result = await runFounderInteractiveSession();
  if (!result.ok) {
    console.error(JSON.stringify(result));
    process.exitCode = 1;
  }
}
