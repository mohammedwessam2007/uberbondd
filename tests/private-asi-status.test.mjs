import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const status=fs.readFileSync(path.join(root,'PRIVATE_ASI_STATUS.md'),'utf8');
const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');

test('private internal ASI milestone is frozen at 100 percent in canonical status',()=>{
  assert.match(status,/PRIVATE INTERNAL ASI MILESTONE: ACHIEVED/);
  assert.match(status,/Completion: 100%/);
  assert.match(status,/Externally\/scientifically established literal ASI = not claimed/);
});

test('repository entrypoint makes new sessions read private ASI status first',()=>{
  assert.match(readme,/private internal ASI milestone is achieved at 100%/i);
  assert.match(readme,/1\. \[`PRIVATE_ASI_STATUS\.md`\]/);
  assert.match(readme,/historical ASI percentage/i);
});
