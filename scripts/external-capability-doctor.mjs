#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  summarizeExternalCapabilities,
  validateExternalCapabilityRegistry
} from '../src/external-capability-control-plane.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

const root = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const registryPath = path.join(root, 'artifacts/external-skill-plugin-registry.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function executableCandidates(name) {
  const ext = process.platform === 'win32'
    ? String(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return dirs.flatMap(dir => ext.map(suffix => path.join(dir, `${name}${suffix.toLowerCase()}`)).concat(ext.map(suffix => path.join(dir, `${name}${suffix.toUpperCase()}`))));
}

function commandOnPath(name) {
  return executableCandidates(name).some(candidate => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function pathExists(relative) {
  return fs.existsSync(path.join(root, relative));
}

function claudePluginEvidence() {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.claude', 'plugins'),
    path.join(home, '.config', 'claude', 'plugins')
  ];
  return candidates.filter(candidate => fs.existsSync(candidate));
}

function main() {
  const raw = readJson(registryPath);
  const validated = validateExternalCapabilityRegistry(raw);
  if (!validated.ok) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      status: 'EXTERNAL_CAPABILITY_DOCTOR_FAILED',
      reasonCodes: validated.reasonCodes,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  const summary = summarizeExternalCapabilities(raw);
  const projectSkills = {
    findSkills: pathExists('.claude/skills/find-skills/SKILL.md'),
    claudeAutomationRecommender: pathExists('.claude/skills/claude-automation-recommender/SKILL.md'),
    taskObserver: pathExists('.claude/skills/task-observer/SKILL.md'),
    uberbondCapabilityAssimilator: pathExists('.claude/skills/uberbond-capability-assimilator/SKILL.md'),
    strix: pathExists('.claude/skills/penetration-testing-with-strix/SKILL.md'),
    agentReach: pathExists('.claude/skills/agent-reach/SKILL.md'),
    uberbondOrchestratorClaude: pathExists('.claude/skills/uberbond-orchestrator/SKILL.md'),
    uberbondOrchestratorCodex: pathExists('.codex/skills/uberbond-orchestrator/SKILL.md')
  };

  const projectArtifacts = {
    orchestrationCanon: pathExists('docs/ORCHESTRATION_CAPABILITY_CANON.md'),
    orchestrationFrontier: pathExists('src/orchestration-frontier.mjs'),
    orchestrationTick: pathExists('scripts/orchestration-frontier-tick.mjs'),
    orchestrationFrontierTests: pathExists('tests/orchestration-frontier.test.mjs'),
    orchestrationTickTests: pathExists('tests/orchestration-frontier-tick.test.mjs'),
    orchestrationDiscoveryTests: pathExists('tests/orchestration-gamechanger-source.test.mjs')
  };

  const host = {
    node: commandOnPath('node'),
    npm: commandOnPath('npm'),
    npx: commandOnPath('npx'),
    python3: commandOnPath('python3') || commandOnPath('python'),
    pipx: commandOnPath('pipx'),
    uv: commandOnPath('uv'),
    docker: commandOnPath('docker'),
    headroom: commandOnPath('headroom'),
    omniroute: commandOnPath('omniroute'),
    strix: commandOnPath('strix'),
    agentReach: commandOnPath('agent-reach'),
    claude: commandOnPath('claude'),
    claudePluginRoots: claudePluginEvidence()
  };

  const runtime = {
    claudeMem: host.claudePluginRoots.length > 0
      ? 'PLUGIN_ROOT_PRESENT__EXACT_INSTALL_NOT_PROVEN'
      : 'NOT_PROVEN',
    headroom: host.headroom ? 'COMMAND_PRESENT' : 'NOT_PRESENT',
    omniroute: host.omniroute ? 'COMMAND_PRESENT' : 'NOT_PRESENT',
    strix: host.strix ? 'COMMAND_PRESENT' : 'NOT_PRESENT',
    agentReach: host.agentReach ? 'COMMAND_PRESENT' : 'NOT_PRESENT',
    fableOrchestrator: host.claude
      ? 'CLAUDE_COMMAND_PRESENT__FABLE_PLANNER_IDENTITY_AND_CALLABLE_WORKER_MENU_NOT_PROVEN'
      : 'NOT_PRESENT'
  };

  const missingProjectSkills = Object.entries(projectSkills).filter(([, present]) => !present).map(([name]) => name);
  const missingProjectArtifacts = Object.entries(projectArtifacts).filter(([, present]) => !present).map(([name]) => name);
  const result = {
    ok: missingProjectSkills.length === 0 && missingProjectArtifacts.length === 0,
    status: missingProjectSkills.length === 0 && missingProjectArtifacts.length === 0
      ? 'PROJECT_CAPABILITY_LAYER_READY__HOST_RUNTIMES_MEASURED_SEPARATELY'
      : 'PROJECT_CAPABILITY_LAYER_INCOMPLETE',
    capabilityDigest: summary.capabilityDigest,
    capabilityCount: summary.capabilityCount,
    projectSkills,
    projectArtifacts,
    missingProjectSkills,
    missingProjectArtifacts,
    host,
    runtime,
    truthBoundary: 'COMMAND_PRESENT_OR_PLUGIN_ROOT_PRESENT_IS_NOT_PROOF_OF_CONFIGURED_PROVIDER_EXECUTION_OR_CALLABLE_FABLE_PLANNER',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

main();
