// Canonical deterministic-suite entrypoint for the nested overnight lanes.
// The existing runner discovers direct tests/*.test.mjs files, so this file
// imports the disjoint feature suites without duplicating their registration.
import './overnight-intent/hostile-guards.test.mjs';
import './overnight-journey/observation.test.mjs';
import './overnight-journey/diagnosis.test.mjs';
import './overnight-journey/offer-compiler.test.mjs';
import './overnight-distribution/partner-referral-owned-distribution.test.mjs';
import './overnight-control/market-capability-control.test.mjs';
import './overnight-control/upgrade-task-compiler.test.mjs';
import './overnight-control/upgrade-plan-cli.test.mjs';
