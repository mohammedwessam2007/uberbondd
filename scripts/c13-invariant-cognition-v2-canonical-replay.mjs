import fs from 'node:fs';
import { evaluateCompoundIntelligence } from '../src/compound-intelligence-evaluation.mjs';
const packet=JSON.parse(fs.readFileSync(new URL('../artifacts/c13-invariant-cognition-v2-canonical-packet.json',import.meta.url),'utf8'));
const result=evaluateCompoundIntelligence(packet);
console.log(JSON.stringify(result,null,2));
if(result.status!=='COMPOUND_INTELLIGENCE_GAIN_SUPPORTED_WITHIN_DEFINED_SCOPE'||result.ok!==true)process.exit(1);
if(result.asiStatus!=='SYSTEM_LEVEL_ASI_NOT_ESTABLISHED')process.exit(2);
