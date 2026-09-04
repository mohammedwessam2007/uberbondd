#!/usr/bin/env node
import { compileCloudWakePlan } from '../src/scheduler.mjs';

const arg = name => {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find(value => value.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
};

const anchor = arg('anchor') || new Date().toISOString();
const intervalMinutes = Number(arg('interval-minutes') || 60);
const horizonHours = Number(arg('horizon-hours') || 24);
const missionTypes = (arg('missions') || 'agent-mesh.tick,frontier.scan')
  .split(',').map(value => value.trim()).filter(Boolean);
const topic = arg('topic') || 'uberbond-background-wake';

try {
  const plan = compileCloudWakePlan({ anchor, intervalMinutes, horizonHours, missionTypes, topic });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, status: 'CLOUD_WAKE_PLAN_INVALID', error: String(error?.message || error), cloudPublishAuthority: 'NONE' })}\n`);
  process.exitCode = 1;
}
