import { createJobHandlers } from './job-handlers.mjs';
import { runFounderOutcomeMissionSupervisor } from './founder-outcome-mission-supervisor.mjs';
import { attachAutonomicCirculationJobHandlers } from './autonomic-circulation-job-handlers.mjs';
import { attachAutonomicPrometheusReceiptBridge } from './autonomic-prometheus-receipt-bridge.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export function createMissionAwareJobHandlers({ enqueueJob = null, ...options } = {}) {
  const handlers = createJobHandlers(options);
  handlers['founder.outcome.mission.pulse'] = async payload => {
    const input = payload && typeof payload === 'object' ? payload : {};
    if (typeof enqueueJob !== 'function') return {
      ok:false,
      status:'FOUNDER_OUTCOME_MISSION_SUPERVISOR_REFUSED',
      reasonCodes:['durable-enqueue-function-required'],
      businessEffectAuthority:'NONE',
      externalEffectLedger:{ ...ZERO_EXTERNAL_EFFECTS }
    };
    return runFounderOutcomeMissionSupervisor({
      ...input,
      store:options.store,
      enqueueJob,
      missionId:input.missionId,
      zeroMarginalDiscoveryConfigured:Boolean(input.zeroMarginalDiscoveryConfigured),
      paymentReconciliationAvailable:true
    });
  };
  attachAutonomicPrometheusReceiptBridge({ handlers, store:options.store });
  return attachAutonomicCirculationJobHandlers({ handlers, store:options.store, cfg:options.cfg, enqueueJob });
}
