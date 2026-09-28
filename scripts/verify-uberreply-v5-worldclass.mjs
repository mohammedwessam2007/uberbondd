import { spawnSync } from 'node:child_process';

const checks=[
  'src/uberreply-offer-router.mjs',
  'src/uberreply-v5-candidate-compiler.mjs',
  'src/uberreply-async-response.mjs',
  'src/uberreply-prework-artifact.mjs',
  'src/uberreply-four-offer-genome.mjs',
  'src/outreach-workbench.mjs',
  'src/copy.mjs',
  'src/pipeline.mjs',
  'server-core.mjs',
  'public/admin.js'
];
const tests=[
  'tests/uberreply-offer-router.test.mjs',
  'tests/uberreply-v5-candidate-compiler.test.mjs',
  'tests/uberreply-async-response.test.mjs',
  'tests/uberreply-prework-artifact.test.mjs',
  'tests/uberreply-v5-copy.test.mjs',
  'tests/uberreply-four-offer-genome.test.mjs',
  'tests/pipeline-deliverability-guard.test.mjs',
  'tests/outreach-workbench.test.mjs',
  'tests/server-request-handler.test.mjs'
];
for(const path of checks){
  const result=spawnSync('node',['--check',path],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
  if(result.error||result.status!==0)process.exit(result.status??1);
}
const result=spawnSync('node',['--test',...tests],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
if(result.error||result.status!==0)process.exit(result.status??1);
