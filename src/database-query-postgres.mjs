import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const DATABASE_QUERY_POSTGRES_ATOM_ID='database.query-postgres';
export const compileDatabaseQueryPostgres=input=>compileUberSkillAtomPlan({...input,atomId:DATABASE_QUERY_POSTGRES_ATOM_ID});
export const executeDatabaseQueryPostgres=input=>executeUberSkillAtom(input);
