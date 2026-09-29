import fs from 'node:fs/promises';
import { compileInfiniteOpusMarket } from '../src/infinite-opus-market.mjs';

// Public, inference-free refresh. Publication is explicit through --output.
const valueAfter = flag => process.argv[process.argv.indexOf(flag) + 1];
const fromFile = process.argv.includes('--from-file') ? valueAfter('--from-file') : null;
let payload;
if (fromFile) payload = JSON.parse(await fs.readFile(fromFile, 'utf8'));
else {
  const response = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('public-catalog-fetch-failed');
  const body = await response.text();
  if (Buffer.byteLength(body) > 10000000) throw new Error('public-catalog-byte-limit');
  payload = JSON.parse(body);
}
const verifiedAt = process.argv.includes('--observed-at') ? valueAfter('--observed-at') : new Date().toISOString();
if (fromFile && !process.argv.includes('--observed-at')) throw new Error('file-observation-time-required');
const snapshot = compileInfiniteOpusMarket(payload, { verifiedAt });
if (process.argv.includes('--output')) await fs.writeFile(valueAfter('--output'), JSON.stringify(snapshot, null, 2) + '\n');
console.log(JSON.stringify({ recordCount: snapshot.recordCount, verifiedAt, expiresAt: snapshot.expiresAt,
  sourceHash: snapshot.sourceHash, providerInferenceCallsPerformed: 0, crownPromotion: false }));
