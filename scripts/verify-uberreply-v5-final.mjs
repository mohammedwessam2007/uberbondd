// verification trigger: exact source branch focused gate
import { spawnSync } from 'node:child_process';

const checks=[
  'src/uberreply-offer-router.mjs',
  'src/uberreply-v5-candidate-compiler.mjs',
  'src/uberreply-async-response.mjs',
  'src/uberreply-prework-artifact.mjs',
  'src/copy.mjs',
  'src/pipeline.mjs'
];
const tests=[
  'tests/uberreply-offer-router.test.mjs',
  'tests/uberreply-v5-candidate-compiler.test.mjs',
  'tests/uberreply-async-response.test.mjs',
  'tests/uberreply-prework-artifact.test.mjs',
  'tests/uberreply-v5-copy.test.mjs',
  'tests/uberreply-four-offer-genome.test.mjs',
  'tests/pipeline-deliverability-guard.test.mjs'
];

for(const path of checks){
  const result=spawnSync('node',['--check',path],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
  if(result.error||result.status!==0)process.exit(result.status??1);
}
const result=spawnSync('node',['--test',...tests],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
if(result.error||result.status!==0)process.exit(result.status??1);
