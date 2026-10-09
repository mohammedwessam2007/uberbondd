import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const JEV_NATIVE_TEST_RECEIPT_SCHEMA='uberbond.jev-native-node-proof.v1';
const tests=[
  'tests/jev-shared-state-tensor.test.mjs',
  'tests/jev-native-pagefault-triage.test.mjs',
  'tests/jev-governed-runtime-service.test.mjs',
  'tests/jev-public-answer-reuse.test.mjs',
  'tests/ubermind-jev-pending-doctor.test.mjs',
  'tests/ubermind-w19-budget-aware-cache.test.mjs',
  'tests/openrouter-jev-governed-adapter.test.mjs',
  'tests/openrouter-decision-market.test.mjs',
  'tests/jev-tensor-one-shot-live-canary.test.mjs',
  'tests/jev-tensor-provider-metadata-readback.test.mjs',
  'tests/ubermind-890-evidence-flywheel.test.mjs',
  'tests/ubermind-sealed-reference-bridge.test.mjs',
  'tests/provable-reference-economics.test.mjs',
  'tests/ubermind-33k-reality-gate.test.mjs',
  'tests/ubermind-cheapest-eligible-reference.test.mjs',
  'tests/ubermind-opus-quality-cost-floor.test.mjs',
  'tests/ubermind-cognitive-residual-economics.test.mjs',
  'tests/ubermind-startup-context-audit.test.mjs',
  'tests/ubermind-pro20-economics.test.mjs',
  'tests/ubermind-pro-matched-cost-benchmark.test.mjs',
  'tests/ubermind-five-hour-quality-budget.test.mjs',
  'tests/ubermind-ultralean-skill.test.mjs',
  'tests/ubermind-five-percent-compression-gate.test.mjs',
  'tests/ubermind-five-percent-native-preflight.test.mjs',
  'tests/ubermind-55-family-subscription-price-proxy.test.mjs',
  'tests/ubermind-55-agent-mesh-total-cost.test.mjs',
  'tests/ubermind-conditional-agent-optimizer.test.mjs',
  'tests/ubermind-omega18-precision-specialists.test.mjs',
  'tests/jev-scaled-preflight.test.mjs',
  'tests/ubermind-public-workload-precommit.test.mjs',
  'tests/ubermind-public-workload-integrity.test.mjs',
  'tests/ubermind-public-issue-intake.test.mjs',
  'tests/ubermind-certified-work-batch.test.mjs',
  'tests/ubermind-real-work-counter.test.mjs',
  'tests/ubermind-exact-source-work.test.mjs',
  'tests/ubermind-operational-work-scoreboard.test.mjs',
  'tests/ubermind-public-issue-backlog.test.mjs',
  'tests/ubermind-real-issue-jev-shadow.test.mjs',
  'tests/ubermind-architecture-atlas.test.mjs',
  'tests/contra-collection-readiness.test.mjs',
  'tests/server-request-handler.test.mjs'
];

/** Native Node verification. Only deterministic mock-provider tests. Never
 * forwards live secrets or credentials; never invokes an outbound model call.
 * A failing or timed-out test returns INCOMPLETE, not a green readiness flag.
 */
export function runJevNativeTests(){
  const start=Date.now();
  const cwd=fileURLToPath(new URL('../',import.meta.url));
  const child=spawnSync(process.execPath,['--test','--test-reporter=tap',...tests],{
    cwd,
    env:{PATH:process.env.PATH??'/usr/bin:/bin',NODE_ENV:'test',
      HOME:'/tmp',CI:'true',OPENROUTER_API_KEY:'',INFINITE_OPUS_PAID_AUTHORIZATION_JSON:''},
    timeout:60000,killSignal:'SIGKILL',maxBuffer:2*1024*1024,
    encoding:'utf8',windowsHide:true
  });
  const stdout=String(child.stdout??'');
  const field=name=>{
    const match=stdout.match(new RegExp('^# '+name+' (\\d+)\\s*$','m'));
    return match?Number(match[1]):null;
  };
  const testsCount=field('tests'),passed=field('pass'),failed=field('fail');
  const ok=child.status===0&&child.signal==null&&
    testsCount!==null&&testsCount>=20&&passed===testsCount&&failed===0;
  const failedCaseNames=stdout.split('\n').filter(x=>/^not ok [0-9]+ - /.test(x))
    .slice(0,6).map(x=>x.replace(/^not ok \d+ - /,'').slice(0,140));
  // Controlled fixture diagnostics only, never raw TAP or arbitrary assertions.
  const w12SafeDiagnostics=[...stdout.matchAll(/W12_DIAG_[A-Z_]+:[A-Za-z0-9_:-]{1,180}/g)]
    .slice(0,6).map(x=>x[0]);
  return {
    schemaVersion:JEV_NATIVE_TEST_RECEIPT_SCHEMA,ok,
    status:ok?'JEV_NATIVE_NODE_REGRESSION_SUITE_PASSED':'JEV_NATIVE_NODE_REGRESSION_INCOMPLETE',
    nodeVersion:process.version,
    executedFiles:tests,
    tests:testsCount,passed,failed,
    exitCode:child.status,signal:child.signal??null,
    durationMs:Date.now()-start,
    failedCaseNames,w12SafeDiagnostics,
    launchFailureCode:child.error?.code??null,
    providerCallsPerformed:0,paidInferenceAuthorized:false,credentialsForwarded:false,
    externalEffectAuthority:'NONE',actualCostUsd:0,
    generalFrontierEquivalenceProven:false,
    truthBoundary:'Actual native Node --test run of deterministic locally mocked provider tests. This proves the scoped software test contract only, not a live Jev tensor inference, real matched cost savings, or a global Crown quality guarantee.'
  };
}
