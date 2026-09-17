// The host bootstrap plan, extracted from scripts/bootstrap-external-capabilities.mjs
// so the rule that governs it can be checked by something other than reading it.
//
// AI_SKILL_PLUGIN_ASSIMILATION_CANON and CLAUDE.md both state the boundary in
// the same words: "That script installs packages only: it does not configure
// LLM/provider credentials, start OmniRoute, run Strix scans, enable Agent Reach
// `--system`/private channels, spend money or contact anyone."
//
// That sentence was the repository's only enforcement of it. The script has an
// --apply mode that spawns each command against the real host and carried no
// test at all, so a seventh step configuring a provider key would have been a
// clean diff. The plan lives here and the predicate below is what says no.

export const BOOTSTRAP_PLAN_VERSION = 'uberbond.external-capability-bootstrap-plan.v1';

export const BOOTSTRAP_STEPS = Object.freeze([
  {
    id: 'claude-mem',
    description: 'Install Claude-Mem into the current Claude Code host',
    command: 'npx',
    args: ['claude-mem', 'install'],
    hostMutation: true,
    externalProviderCallExpected: false
  },
  {
    id: 'headroom',
    description: 'Install Headroom CLI/runtime in an isolated uv tool environment',
    command: 'uv',
    args: ['tool', 'install', '--python', '3.13', 'headroom-ai[all]'],
    hostMutation: true,
    externalProviderCallExpected: false
  },
  {
    id: 'omniroute',
    description: 'Install OmniRoute CLI; do not start it or connect providers',
    command: 'npm',
    args: ['install', '-g', 'omniroute'],
    hostMutation: true,
    externalProviderCallExpected: false
  },
  {
    id: 'strix',
    description: 'Install Strix CLI; do not configure an LLM or start a scan',
    command: 'pipx',
    args: ['install', 'strix-agent'],
    hostMutation: true,
    externalProviderCallExpected: false
  },
  {
    id: 'agent-reach-package',
    description: 'Install Agent Reach package from its canonical GitHub archive',
    command: 'pipx',
    args: ['install', 'https://github.com/Panniantong/agent-reach/archive/main.zip'],
    hostMutation: true,
    externalProviderCallExpected: false
  },
  {
    id: 'agent-reach-safe-check',
    description: 'Run Agent Reach default check-only installer; no --system and no private/login channels',
    command: 'agent-reach',
    args: ['install', '--env=auto'],
    hostMutation: false,
    externalProviderCallExpected: false,
    dependsOn: 'agent-reach-package'
  }
]);

// Matched against the joined argv of a step. Each entry is one clause of the
// canon sentence, so a violation reports which clause it broke rather than a
// generic refusal.
const FORBIDDEN = Object.freeze([
  ['configures-credentials', /(?:^|\s)--?(?:api[-_]?key|token|secret|auth|credential|password)\b|(?:^|\s)(?:configure|config|auth|login|signin|connect)(?:\s|$)/i],
  ['starts-a-service', /(?:^|\s)(?:start|serve|server|daemon|up|launch)(?:\s|$)/i],
  ['runs-a-scan', /(?:^|\s)(?:scan|pentest|exploit|attack)(?:\s|$)/i],
  ['enables-system-or-private-channel', /(?:^|\s)--(?:system|private|login|cookies?|session)\b/i],
  ['spends-money', /(?:^|\s)(?:buy|purchase|subscribe|checkout|billing)(?:\s|$)/i],
  ['contacts-someone', /(?:^|\s)(?:send|email|message|notify|post|publish)(?:\s|$)/i]
]);

// `install` is what this script is for. A step whose argv does not contain it is
// doing something else, whatever it calls itself.
const INSTALL_VERB = /(?:^|\s)install(?:\s|$)/i;

export function auditBootstrapPlan(steps = BOOTSTRAP_STEPS) {
  const findings = [];
  const list = Array.isArray(steps) ? steps : [];
  if (!list.length) findings.push({ step: null, violation: 'empty-plan' });

  for (const step of list) {
    const id = String(step?.id ?? '(unnamed)');
    const args = Array.isArray(step?.args) ? step.args.map(String) : [];
    const argv = [String(step?.command ?? ''), ...args].join(' ');

    if (!INSTALL_VERB.test(argv)) findings.push({ step: id, violation: 'not-an-install-command', argv });
    // A shell turns one audited command into anything the string says.
    if (step?.shell === true) findings.push({ step: id, violation: 'shell-invocation', argv });
    if (step?.externalProviderCallExpected === true) findings.push({ step: id, violation: 'expects-provider-call', argv });

    for (const [violation, pattern] of FORBIDDEN) {
      if (pattern.test(argv)) findings.push({ step: id, violation, argv });
    }
  }

  return {
    ok: findings.length === 0,
    version: BOOTSTRAP_PLAN_VERSION,
    status: findings.length === 0 ? 'PLAN_INSTALLS_PACKAGES_ONLY' : 'PLAN_EXCEEDS_INSTALL_ONLY_BOUNDARY',
    stepCount: list.length,
    findings,
    boundary: 'Package installation is not provider configuration, a started service, a scan, a private channel, spend, or contact.'
  };
}
