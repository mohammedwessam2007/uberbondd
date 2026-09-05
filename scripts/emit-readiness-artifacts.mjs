#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const files = ['docs/CURRENT_SYSTEM_STATE.md', 'artifacts/system-readiness.json'];
for (const path of files) {
  const encoded = Buffer.from(readFileSync(path, 'utf8'), 'utf8').toString('base64');
  const chunkSize = 1800;
  const chunks = Math.ceil(encoded.length / chunkSize);
  console.log(`READINESS_ARTIFACT_BEGIN ${path} ${chunks}`);
  for (let i = 0; i < chunks; i += 1) {
    console.log(`READINESS_ARTIFACT_CHUNK ${path} ${i + 1}/${chunks} ${encoded.slice(i * chunkSize, (i + 1) * chunkSize)}`);
  }
  console.log(`READINESS_ARTIFACT_END ${path}`);
}
