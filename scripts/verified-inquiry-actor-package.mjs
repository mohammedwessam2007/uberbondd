import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const actorDir = 'actors/verified-inquiry-defects';
const visited = new Set();
const queue = [`${actorDir}/main.mjs`];
const external = new Set();
while (queue.length) {
  const relative = queue.shift();
  if (visited.has(relative)) continue;
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) throw Error(`Missing or invalid source: ${relative}`);
  visited.add(relative);
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?)\s*['"]([^'"]+)['"]/g)) {
    const spec = match[1];
    if (spec.startsWith('.')) {
      const dependency = relative === `${actorDir}/main.mjs` && spec.startsWith('./src/') ? spec.slice(2) : path.relative(root, path.resolve(path.dirname(file), spec));
      if (!dependency.startsWith('src/') && !dependency.startsWith(actorDir + '/')) throw Error(`Unexpected actor dependency: ${dependency}`);
      queue.push(dependency);
    } else if (!spec.startsWith('node:')) external.add(spec.split('/')[0].startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
  }
}
const dependencies = Object.keys(JSON.parse(fs.readFileSync(path.join(root, actorDir, 'package.json'))).dependencies);
for (const dependency of external) if (!dependencies.includes(dependency)) throw Error(`Unpackaged external module: ${dependency}`);
const files = [...visited].sort();
const ignore = ['**', '!src/', '!actors/', `!${actorDir}/`, ...files.map(file => `!${file}`), `!${actorDir}/package.json`, `!${actorDir}/package-lock.json`].join('\n') + '\n';
const ignoreFile = path.join(root, actorDir, 'Dockerfile.dockerignore');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(ignoreFile, 'utf8') !== ignore) throw Error('Actor context allowlist drift. Regenerate with npm run actor:package');
} else fs.writeFileSync(ignoreFile, ignore);
console.log(JSON.stringify({ actorSourceFiles: files, externalModules: [...external].sort(), ignoreFile: path.relative(root, ignoreFile), mode: process.argv.includes('--check') ? 'verified' : 'generated' }, null, 2));
