import { createJobHandlers } from './job-handlers.mjs';
import { runFounderOutcomeMissionSupervisor } from './founder-outcome-mission-supervisor.mjs';
import { runFrontierLearningJob } from './frontier-learning-job-handler.mjs';
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
  handlers['frontier.learning.process'] = async payload => {
    const input = payload && typeof payload === 'object' ? payload : {};
    return runFrontierLearningJob({
      ...input,
      root: input.root || process.cwd()
    });
  };
  return handlers;
}
