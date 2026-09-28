import { spawnSync } from 'node:child_process';

const steps=[
  ['node',['--check','src/uberreply-v5-candidate-compiler.mjs']],
  ['node',['--check','src/uberreply-async-response.mjs']],
  ['node',['--check','src/uberreply-prework-artifact.mjs']],
  ['node',['--check','src/copy.mjs']],
  ['node',['--check','src/pipeline.mjs']],
  ['node',['--test',
    'tests/uberreply-v5-candidate-compiler.test.mjs',
    'tests/uberreply-async-response.test.mjs',
    'tests/uberreply-prework-artifact.test.mjs',
    'tests/uberreply-v5-copy.test.mjs',
    'tests/uberreply-four-offer-genome.test.mjs',
    'tests/pipeline-deliverability-guard.test.mjs'
  ]]
];

for(const [command,args] of steps){
  const out=spawnSync(command,args,{cwd:process.cwd(),env:process.env,stdio:'inherit'});
  if(out.error)process.exit(1);
  if(out.status!==0)process.exit(out.status??1);
}
