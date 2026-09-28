import { spawnSync } from 'node:child_process';

const tests=[
  'tests/uberreply-v5-candidate-compiler.test.mjs',
  'tests/uberreply-async-response.test.mjs',
  'tests/uberreply-prework-artifact.test.mjs',
  'tests/uberreply-v5-copy.test.mjs',
  'tests/uberreply-four-offer-genome.test.mjs',
  'tests/pipeline-deliverability-guard.test.mjs'
];
const checks=[
  'src/uberreply-v5-candidate-compiler.mjs',
  'src/uberreply-async-response.mjs',
  'src/uberreply-prework-artifact.mjs',
  'src/copy.mjs',
  'src/pipeline.mjs'
];
for(const path of checks){
  const r=spawnSync('node',['--check',path],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
  if(r.error||r.status!==0)process.exit(r.status??1);
}
const t=spawnSync('node',['--test',...tests],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
if(t.error||t.status!==0)process.exit(t.status??1);
