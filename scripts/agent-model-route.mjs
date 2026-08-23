#!/usr/bin/env node
// Zero-effect operator entry point for the model router.
//
// This does not call a provider and does not authorize one. Its worker input is
// explicitly the set already permitted by the activation/consequence layer.
// The result is a routing decision receipt that a caller may use only after the
// existing activation/budget/worker gates have independently permitted work.

import { pathToFileURL } from 'node:url';
import { routePermittedWorkers } from '../src/agent-model-routing-integration.mjs';

export function evaluateConfiguredModelRoute({ env = process.env, random = Math.random, date = new Date() } = {}) {
  const workers = parseArrayFrom(env.AGENT_MODEL_ROUTE_WORKERS, 'AGENT_MODEL_ROUTE_WORKERS');
  const benchmarks = parseArrayFrom(env.AGENT_MODEL_ROUTE_BENCHMARKS, 'AGENT_MODEL_ROUTE_BENCHMARKS');
  return routePermittedWorkers({
    workers,
    benchmarks,
    taskClass: String(env.AGENT_MODEL_ROUTE_TASK_CLASS || 'general'),
    enabled: env.AGENT_MODEL_ROUTE_ENABLED === 'true',
    allowUnbenchmarkedExploration: env.AGENT_MODEL_ROUTE_ALLOW_UNBENCHMARKED === 'true',
    minimumEvidenceConfidence: env.AGENT_MODEL_ROUTE_MIN_CONFIDENCE ?? 0.5,
    explorationRate: env.AGENT_MODEL_ROUTE_EXPLORATION_RATE ?? 0,
    maxBenchmarkAgeDays: env.AGENT_MODEL_ROUTE_MAX_BENCHMARK_AGE_DAYS ?? 30,
    random,
    date
  });
}

function parseArrayFrom(rawValue, name) {
  const raw = String(rawValue || '').trim();
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${name} must be a JSON array`);
  return parsed;
}

async function main() {
  const result = evaluateConfiguredModelRoute();
  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 2;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main()
    .then(code => { process.exitCode = code; })
    .catch(error => {
      console.error(`[agent-model-route] ${String(error?.message || error).slice(0, 300)}`);
      process.exitCode = 2;
    });
}
