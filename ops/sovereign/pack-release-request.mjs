#!/usr/bin/env node
import { readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { admitOfflineReleasePack } from '../../src/sovereign-release-handoff.mjs';

function output(payload, code = 0) { process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`); process.exitCode = code; }
function text(value, max = 1000) { return String(value ?? '').trim().slice(0, max); }

const requestPath = process.argv[2];
const outPath = process.argv[3] || '';
if (!requestPath) {
  output({ ok: false, status: 'OFFLINE_RELEASE_PACK_REFUSED', reasonCodes: ['release-request-path-required'], deploymentAuthority: 'NONE', businessEffectAuthority: 'NONE' }, 2);
} else {
  try {
    const request = JSON.parse(readFileSync(resolve(requestPath), 'utf8'));
    const localHeadSha = text(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }), 80).toLowerCase();
    const worktreeClean = text(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }), 1000) === '';
    const signingKey = text(process.env.UBERBOND_RELEASE_SIGNING_KEY, 2000);
    let signingKeyPresent = false;
    let signingKeySymlink = false;
    if (signingKey) {
      try {
        const stat = lstatSync(resolve(signingKey));
        signingKeyPresent = stat.isFile();
        signingKeySymlink = stat.isSymbolicLink();
      } catch { signingKeyPresent = false; }
    }
    const admitted = admitOfflineReleasePack({ request, localHeadSha, worktreeClean, signingKeyPresent, signingKeySymlink });
    if (!admitted.ok) output(admitted, 2);
    else {
      const args = ['pack', '.'];
      if (outPath) args.push(resolve(outPath));
      execFileSync('./ops/sovereign/uberbondctl', args, { stdio: 'inherit', env: process.env });
      output({ ok: true, status: 'SIGNED_SOVEREIGN_RELEASE_PACKED__NOT_DEPLOYED', sourceCommit: request.sourceCommit, requestDigest: request.requestDigest, outputPath: outPath ? resolve(outPath) : null, signingAuthority: 'LOCAL_PROCESS_ONLY', deploymentAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', truthBoundary: 'THE OFFLINE AUTHORING MACHINE CREATED A SIGNED RELEASE BUNDLE. NO RUNTIME HOST DEPLOYMENT OR RUNTIME SOVEREIGNTY CLAIM IS IMPLIED.' });
    }
  } catch (error) {
    output({ ok: false, status: 'OFFLINE_RELEASE_PACK_REFUSED', reasonCodes: ['offline-release-pack-controller-failed'], detail: text(error?.message || error, 300), deploymentAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE' }, 2);
  }
}
