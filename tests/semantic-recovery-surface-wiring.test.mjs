import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('semantic tribunal generator uses concrete executable recovery surfaces rather than vocabulary', () => {
  const source = readFileSync(new URL('../scripts/semantic-requirement-tribunal.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ hasConcreteRecoverySurface \} from ['"]\.\.\/src\/semantic-recovery-surface\.mjs['"]/);
  assert.doesNotMatch(source, /const STATEFUL\s*=/);
  assert.match(source, /!hasConcreteRecoverySurface\(sourceText\)/);
  assert.match(source, /NOT_APPLICABLE__STATIC_ANALYSIS_FOUND_NO_CONCRETE_STATEFUL_OR_LONG_RUNNING_SURFACE/);
});
