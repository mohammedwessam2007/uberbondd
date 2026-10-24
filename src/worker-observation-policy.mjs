// PHOENIX T210: observation probes require their own exact, explicit opt-in.
// This is not a global network firewall: other worker paths need independent review.
const OPTIONAL_NETWORK_PROBES = new Set([
  'UBERMIND_PUBLIC_ISSUE_INTAKE_ENABLED',
  'WINNR_SMTP_READINESS_PROBE_ENABLED'
]);

export function workerObservationEnabled(environment, flag) {
  return OPTIONAL_NETWORK_PROBES.has(flag)
    && environment !== null
    && typeof environment === 'object'
    && Object.hasOwn(environment, flag)
    && environment[flag] === 'true';
}
