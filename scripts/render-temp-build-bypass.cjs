'use strict';
if (
  process.env.UBERMIND_SKIP_TEMP_RENDER_BUILD_OVERRIDE === '1' &&
  process.argv.length === 1 &&
  Array.isArray(process.execArgv) &&
  process.execArgv.includes('-e') &&
  process.execArgv.includes('--input-type=module')
) process.exit(0);
