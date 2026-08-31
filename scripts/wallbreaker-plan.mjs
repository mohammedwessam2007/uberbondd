#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { planWallbreakerCycle } from '../src/wallbreaker.mjs';

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  const path = process.argv[2];
  const raw = path ? await readFile(path, 'utf8') : await readStdin();
  if (!raw.trim()) {
    console.error('Usage: npm run wallbreaker -- path/to/problem.json OR pipe JSON on stdin');
    process.exitCode = 2;
    return;
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    console.error('Wallbreaker input must be valid JSON.');
    process.exitCode = 2;
    return;
  }

  const result = planWallbreakerCycle(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
