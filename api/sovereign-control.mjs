// The founder's read-only view of the sovereign organs.
//
// This route exists so the decision, sovereignty, meta-rationality and
// calibration modules have a caller. Without one they are what the reachability
// ratchet was built to catch: implemented, tested, green, and dead.
//
// It is deliberately GET-only and composes nothing that acts. The organs it
// surfaces end at a recommendation, and this surface cannot raise that rung --
// there is no path here from reading a packet to executing it.
//
// It also does not import the private core. That is not an oversight to be
// tidied later: every entry point in this repository runs without a person
// present, and a route that could read private life state would hand it to
// whatever holds the admin token. The private core stays reachable only from an
// operator command carrying the founder's authorization on the call.
import crypto from 'node:crypto';
import { compileOptionUniverse, forecastOption, compileDecisionPacket } from '../src/sovereign-decision-packet.mjs';
import { authorityFor, exitReadiness, SOVEREIGNTY_TYPES, HUMAN_ONLY_CROSSINGS, NOT_AUTHORITY } from '../src/sovereignty-type-system.mjs';
import { selectMethod, shouldContinueReasoning, TERMINAL_EPISTEMIC_STATES } from '../src/meta-rational-boundary.mjs';
import { calibrationSummary } from '../src/reality-calibration-ledger.mjs';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer'
};

function send(res, status, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(status).json(payload);
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(payload));
}

function bearerHeader(value) {
  if (Array.isArray(value)) return value.length === 1 && typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}

function equalBearer(header, secret) {
  if (typeof secret !== 'string' || !secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(bearerHeader(header));
  return actual.length === expected.length && actual.length > 0 && crypto.timingSafeEqual(actual, expected);
}

/**
 * The constitution as the running code actually holds it.
 *
 * Read from the modules rather than restated here. A hand-written copy of these
 * rules would drift from the enforcement and become a page that says the system
 * is safe while the system stopped being it.
 */
export function sovereignConstitution() {
  return {
    typeLadder: SOVEREIGNTY_TYPES,
    humanOnlyCrossings: HUMAN_ONLY_CROSSINGS,
    notAuthority: NOT_AUTHORITY,
    terminalEpistemicStates: TERMINAL_EPISTEMIC_STATES,
    triad: 'MOHAMED PROVIDES WILL. UBERBOND PROVIDES INTELLIGENCE. REALITY PROVIDES FEEDBACK.'
  };
}

const supplyValueBoundary = forecasts =>
  (Array.isArray(forecasts) ? forecasts : []).some(row => row?.valueBoundary === true);

/**
 * Assembles the read-only view.
 *
 * Every field is derived; nothing here is stored, sent, or acted on. The
 * decision packet is included only when the caller supplied the inputs for one,
 * because an empty packet shaped like a real one is worse than no packet.
 */
export function buildSovereignControlView({ decision = null, options = [], forecasts = [], scores = [], exit = null, reasoning = null, method = null, now = new Date() } = {}) {
  const view = {
    ok: true,
    status: 'SOVEREIGN_CONTROL_VIEW',
    at: new Date(now).toISOString(),
    constitution: sovereignConstitution(),
    calibration: calibrationSummary(scores),
    // Absent rather than faked when not asked for.
    decisionPacket: null,
    exit: exit ? exitReadiness(exit) : null,
    reasoningBudget: reasoning ? shouldContinueReasoning(reasoning) : null,
    methodSelection: method ? selectMethod(method) : null,
    highestRung: 'RECOMMENDATION',
    founderAuthority: 'THIS SURFACE READS. IT CANNOT CHOOSE, DELEGATE, OR ACT.',
    businessEffectAuthority: 'NONE'
  };

  if (decision && Array.isArray(options) && options.length) {
    const universe = compileOptionUniverse(options);
    if (universe.ok) {
      const rows = universe.options.map(option => {
        const supplied = (Array.isArray(forecasts) ? forecasts : []).find(f => f?.option === option.name);
        return forecastOption({
          option, evidence: supplied?.evidence || [], distribution: supplied?.distribution || null,
          // Only an explicit declaration counts; an unlabelled option is
          // unknown, not irreversible.
          irreversible: option.reversible === false, now
        });
      });
      view.decisionPacket = compileDecisionPacket({ decision, universe, forecasts: rows, valueBoundary: Boolean(supplyValueBoundary(forecasts)), now });
    } else {
      view.decisionPacket = universe;
    }
  }
  return view;
}

export function createHandler(deps = {}) {
  const env = deps.env || process.env;
  const build = deps.buildSovereignControlView || buildSovereignControlView;
  const clock = deps.now || (() => new Date());

  return async function handler(req, res) {
    // GET only. A POST here would be the seam through which a read surface
    // becomes an acting one, which is the whole thing this route must not be.
    if (String(req?.method || '').toUpperCase() !== 'GET') {
      return send(res, 405, { ok: false, status: 'REFUSED', reasonCodes: ['method-not-allowed'] });
    }
    if (!env.ADMIN_TOKEN) {
      return send(res, 503, { ok: false, status: 'REFUSED', reasonCodes: ['sovereign-control-admin-auth-not-configured'] });
    }
    if (!equalBearer(req?.headers?.authorization, env.ADMIN_TOKEN)) {
      return send(res, 401, { ok: false, status: 'REFUSED', reasonCodes: ['sovereign-control-unauthorized'] });
    }

    try {
      return send(res, 200, build({ now: clock() }));
    } catch (error) {
      return send(res, 500, { ok: false, status: 'REFUSED', reasonCodes: ['sovereign-control-view-failed'], detail: String(error?.message || error) });
    }
  };
}

export { authorityFor };
export default createHandler();
