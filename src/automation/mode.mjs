export const AUTOMATION_MODES = Object.freeze(['shadow', 'approval', 'autonomous']);

export class AutomationGateError extends Error {
  constructor(reason) {
    super(`Automation gate denied: ${reason}`);
    this.name = 'AutomationGateError';
    this.reason = reason;
  }
}

function normalizedMode(cfg = {}) {
  const mode = String(cfg.automation?.mode || 'shadow').toLowerCase();
  return AUTOMATION_MODES.includes(mode) ? mode : 'shadow';
}

/**
 * Resolves the three operating-mode facts a caller needs before doing anything: which mode is
 * active, whether the master switch is on, and whether every kill switch this mode depends on is
 * satisfied. This never reaches into outbound, inbound, or discovery config -- those stay independent.
 */
export function automationStatus(cfg = {}) {
  const mode = normalizedMode(cfg);
  const enabled = cfg.automation?.enabled === true;
  return {
    mode,
    enabled,
    campaignPolicyRequired: cfg.automation?.campaignPolicyRequired !== false,
    autonomousConfirmed: cfg.automation?.autonomousConfirmed === true,
    // "Live" here means the mode is allowed to advance prospects without a per-item owner click --
    // it says nothing about whether any individual side effect (a real send, a real charge) is
    // itself enabled, which is always a separate, independently-gated decision.
    live: enabled && mode !== 'shadow'
  };
}

/**
 * The single choke point every automated (non-owner-clicked) stage transition must call before
 * acting on a batch of prospects under a campaign policy. Returns { ok, reason } rather than
 * throwing, so callers can log-and-skip instead of crashing a worker batch; use
 * assertAutomationGate for call sites that should hard-fail closed instead.
 */
export function evaluateAutomationGate(cfg = {}, { hasActivePolicy = false } = {}) {
  const status = automationStatus(cfg);
  if (!status.enabled) return { ok: false, reason: 'automation-disabled', status };
  if (status.mode === 'shadow') return { ok: false, reason: 'shadow-mode-no-external-writes', status };
  if (status.campaignPolicyRequired && !hasActivePolicy) return { ok: false, reason: 'no-active-campaign-policy', status };
  if (status.mode === 'autonomous' && !status.autonomousConfirmed) {
    return { ok: false, reason: 'autonomous-not-explicitly-confirmed', status };
  }
  return { ok: true, reason: '', status };
}

export function assertAutomationGate(cfg = {}, options = {}) {
  const result = evaluateAutomationGate(cfg, options);
  if (!result.ok) throw new AutomationGateError(result.reason);
  return result;
}

/**
 * Shadow mode always runs every stage read-only: crawl, score, qualify, draft -- it just never
 * lets a stage cross into anything an outside party could see (a send, a charge, a site change).
 * This is the predicate stage workers use to decide "compute and record" vs "compute, record, and
 * act".
 */
export function isShadowOnly(cfg = {}) {
  return automationStatus(cfg).mode === 'shadow' || automationStatus(cfg).enabled !== true;
}
