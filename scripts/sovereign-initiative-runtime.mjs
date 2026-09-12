#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export { SOVEREIGN_INITIATIVE_RUNTIME_VERSION, runSovereignInitiativeRuntime } from './sovereign-initiative-selection-runtime.mjs';

const invokedAsCli = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) {
  import('./sovereign-initiative-host.mjs')
    .then(({ runSovereignInitiativeHost }) => runSovereignInitiativeHost())
    .then(result => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (!result?.ok) process.exitCode = 2;
    })
    .catch(error => {
      process.stdout.write(`${JSON.stringify({ ok:false, status:'SOVEREIGN_INITIATIVE_HOST_REFUSED', reasonCodes:[`unexpected:${String(error?.message || error).slice(0,300)}`], businessEffectAuthority:'NONE', externalEffectAuthority:'NONE' }, null, 2)}\n`);
      process.exitCode = 2;
    });
}
