export const DATABASE_HYGIENE_REPOSITORY_VERSION='uberbond.database-hygiene-repository.v1';

async function boundedDelete(pool,{table,idColumn='content_id',whereSql,params,batchSize}){
 const size=Math.max(1,Math.min(5000,Number(batchSize)||500));
 const sql=`WITH doomed AS (SELECT ${idColumn} FROM ${table} WHERE ${whereSql} ORDER BY ${idColumn} LIMIT $${params.length+1} FOR UPDATE SKIP LOCKED) DELETE FROM ${table} t USING doomed d WHERE t.${idColumn}=d.${idColumn} RETURNING t.${idColumn}`;
 const result=await pool.query(sql,[...params,size]); return result.rowCount;
}

export async function runSafeDatabaseHygiene(pool,{now=new Date(),cacheRetentionDays=7,stagedRetentionDays=14,batchSize=500}={}){
 if(!pool?.query) throw new Error('postgres-pool-required');
 const cacheCutoff=new Date(now.getTime()-Math.max(1,cacheRetentionDays)*86400000);
 const stagedCutoff=new Date(now.getTime()-Math.max(1,stagedRetentionDays)*86400000);
 const expiredCache=await boundedDelete(pool,{table:'public_evidence_cache',idColumn:'cache_key',whereSql:'expires_at < $1 AND updated_at < $2',params:[now,cacheCutoff],batchSize});
 const expiredStaged=await boundedDelete(pool,{table:'staged_content_repository',idColumn:'content_id',whereSql:"status IN ('CONSUMED','FAILED','EXPIRED','SUPERSEDED') AND updated_at < $1",params:[stagedCutoff],batchSize});
 return {ok:true,status:'BOUNDED_HYGIENE_COMPLETE',deleted:{publicEvidenceCache:expiredCache,stagedContent:expiredStaged},vacuumAction:'NONE_AUTOVACUUM_EXPECTED'};
}
