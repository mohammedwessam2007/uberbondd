import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const receipt = {
  schema: 'uberbond.free-runtime-witness.v1',
  generatedAt: new Date().toISOString(),
  sourceSha: String(process.env.UBERBOND_RUNTIME_SHA || '').trim() || null,
  eventName: String(process.env.UBERBOND_RUNTIME_EVENT || 'manual').trim(),
  runId: String(process.env.UBERBOND_RUNTIME_RUN_ID || '').trim() || null,
  runtimeAlive: true,
  externalEffectAuthority: 'NONE',
  truthBoundary: 'THIS_RECEIPT_PROVES_THE_FREE_EXECUTION_SUBSTRATE_RAN; IT_DOES_NOT_PROVE_ANY_EXTERNAL_OR_COMMERCIAL_EFFECT'
};

const output = path.join(root, 'artifacts', 'free-runtime-witness.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(receipt));
