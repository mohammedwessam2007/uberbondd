import fs from 'node:fs/promises';
import path from 'node:path';

const dir=path.resolve(process.env.DATA_DIR||'./data');
await fs.mkdir(dir,{recursive:true});
const file=path.join(dir,'db.json');
const createdAt=new Date().toISOString();
const campaign={
  id:'camp_global_demo',
  name:'Global Digital Opportunity Scan',
  niche:'SaaS, hospitality, premium brands, agencies, medical and scientific organizations',
  offer:'Evidence-backed digital opportunity audit',
  minScore:60,
  dailyCaps:{A:10,B:10},
  maxFollowups:0,
  autoSend:false,
  approved:true,
  createdAt
};
const db={
  version:3,
  campaigns:[campaign],prospects:[],jobs:[],messages:[],replies:[],suppressions:[],socialTasks:[],accounts:[],auditLog:[],settings:{},
  leads:[],orders:[],subscriptions:[],monitoringRuns:[],notifications:[],revenueEvents:[]
};
await fs.writeFile(file,JSON.stringify(db,null,2));
console.log(`Seeded UberBond Revenue Engine in ${file}`);
