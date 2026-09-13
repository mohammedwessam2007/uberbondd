import { createJobHandlers } from './job-handlers.mjs';
import { runFounderOutcomeMissionSupervisor } from './founder-outcome-mission-supervisor.mjs';
import { runFrontierLearningJob } from './frontier-learning-job-handler.mjs';
import { runPersonalCivilizationJob } from './personal-civilization-job-handler.mjs';
import { runEconomicWealthResidentSupervisor } from './economic-wealth-resident-supervisor.mjs';
import { runEconomicWealthRepairJob, runEconomicWealthSaturationJob } from './economic-wealth-repair-job-handler.mjs';
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
  handlers['personal.civilization.pulse'] = async payload => {
    const input = payload && typeof payload === 'object' ? payload : {};
    return runPersonalCivilizationJob({
      ...input,
      root: input.root || process.cwd()
    });
  };
  handlers['universal.wealth.pulse'] = async payload => {
    const input = payload && typeof payload === 'object' ? payload : {};
    return runEconomicWealthResidentSupervisor({
      ...input,
      root: input.root || process.cwd(),
      enqueueJob
    });
  };
  handlers['economic.wealth.repair'] = async payload => {
    const input = payload && typeof payload === 'object' ? payload : {};
    return runEconomicWealthRepairJob({
      ...input,
      store:options.store,
      enqueueJob
    });
  };
  handlers['economic.wealth.saturate'] = async payload => {
    const input = payload && typeof payload === 'object' ? payload : {};
    return runEconomicWealthSaturationJob({
      ...input,
      store:options.store,
      enqueueJob
    });
  };
  return handlers;
}
