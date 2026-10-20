#!/usr/bin/env node
// Read-only GitHub PR-snapshot auditor. Never prints environment credentials.
import {execFileSync} from 'node:child_process';
import {analyzePhoenixSwarmPrs} from '../src/phoenix-swarm-pr-overlap.mjs';
const repo='mohammedwessam2007/uberbondd';
const mode=process.argv.slice(2);
const numericList=(mode.length===2&&mode[0]==='--prs')?mode[1]:null;
if(!numericList || !/^[1-9][0-9]{0,5}(,[1-9][0-9]{0,5}){1,15}$/.test(numericList)){
  console.log(JSON.stringify({ok:false,status:'REFUSED_EXPLICIT_BOUNDED_PR_LIST_REQUIRED',example:'--prs 1513,1512,1498'}));
  process.exitCode=2;
}else {
  const numbers=numericList.split(',').map(Number);
  let readCalls=0;
  const api=(path)=>{
    const result=JSON.parse(execFileSync('gh',['api',path],{
    encoding:'utf8',timeout:20000,maxBuffer:10*1024*1024,stdio:['ignore','pipe','ignore']
    }));
    readCalls++;
    return result;
  };
  let output;
  try {
    const mainSha=api(`repos/${repo}/git/ref/heads/main`).object.sha;
    const records=[];
    for(const n of numbers){
      const meta=api(`repos/${repo}/pulls/${n}`);
      const files=[];
      for(let page=1;page<=31;page++){
        const result=api(`repos/${repo}/pulls/${n}/files?per_page=100&page=${page}`);
        if(!Array.isArray(result)||result.length>100)throw Error('BAD_FILE_PAGE');
        files.push(...result.map(f=>f.filename));
        if(result.length<100)break;
        if(page===31)throw Error('PR_FILE_PAGINATION_NOT_EXHAUSTED');
      }
      const fresh=api(`repos/${repo}/pulls/${n}`);
      records.push({number:n,state:meta.state,headSha:meta.head?.sha,
        baseSha:meta.base?.sha,files,headChangedDuringRead:meta.head?.sha!==fresh.head?.sha
          ||meta.base?.sha!==fresh.base?.sha||meta.state!==fresh.state});
    }
    output=analyzePhoenixSwarmPrs(records,{mainSha,checkedAt:new Date().toISOString()});
    output.githubMetadataReadCalls=readCalls;
    if(!output.ok)process.exitCode=1;
  }catch{
    output={ok:false,status:'GITHUB_SNAPSHOT_UNAVAILABLE_OR_INCONSISTENT',
      reason:'No merge or duplicate conclusion can be drawn.'};
    process.exitCode=1;
  }
  console.log(JSON.stringify(output,null,2));
}
