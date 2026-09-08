import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireCapability } from '../src/capability-genome-runtime.mjs';
import { resolveMissingCapabilityPath } from '../src/missing-capability-build-path.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const taxonomy=JSON.parse(fs.readFileSync(path.join(root,'artifacts/capability-genome/capability-atoms.json'),'utf8'));
const required=['cloud.inspect-deployment','database.query-postgres','payment.verify-cleared','sandbox.run-test'];
const canonical=new Set(taxonomy.atoms.map(a=>a.id));
const missingCanonical=required.filter(id=>!canonical.has(id));
if(missingCanonical.length){console.error(JSON.stringify({ok:false,status:'CANONICAL_ATOM_FIXTURE_INVALID',missingCanonical,businessEffectAuthority:'NONE'},null,2));process.exit(1);}
const acquisition=acquireCapability({mission:'portable backend current-main closure',requiredAtomIds:required,capabilities:[],authorizedPermissions:[],securityEvidenceByCapability:{},modelCandidates:[]});
const result=resolveMissingCapabilityPath({mission:'portable backend current-main closure',requiredAtomIds:required,acquisitionResult:acquisition,internalBuildCandidate:{id:'portable-backend-current-main',atomIds:required,sourcePaths:['portable-server.mjs','docker-compose.portable.yml','scripts/provider-neutral-backend-doctor.mjs'],acceptanceTests:['tests/portable-server.test.mjs','tests/provider-neutral-backend-doctor.test.mjs'],rollbackPlan:'retain current canonical server/Vercel path and revert portable child commits if hostile verification fails',inputs:['current-main server/auth/payment runtime'],outputs:['portable runtime','provider-neutral doctor','recovery receipt']}});
const ok=acquisition.status==='WORLD_SEARCH_REQUIRED' && result.ok && result.status==='INTERNAL_BUILD_HANDOFF_PREPARED__NOT_AUTHORIZED_TO_SELF_PROMOTE' && result.businessEffectAuthority==='NONE';
console.log(JSON.stringify({ok,status:ok?'MISSING_CAPABILITY_BUILD_PATH_HELD':'BOUNDARY_LOST',canonicalAtomIds:required,acquisitionStatus:acquisition.status,result,note:'This doctor proves the build-path mechanism over canonical atoms. It does not claim the portable backend is already implemented or deployed.'},null,2));
if(!ok)process.exitCode=1;
