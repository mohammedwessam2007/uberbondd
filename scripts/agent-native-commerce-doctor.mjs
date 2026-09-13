#!/usr/bin/env node
import { buildAgentCommerceManifest, createDelegatedAgentIdentity, executeAgentCommand } from '../src/agent-native-commerce.mjs';

const now='2026-09-12T19:00:00Z';
const product={productId:'doctor-product',displayName:'Doctor Product',commands:[{name:'quote',description:'Compile a bounded quote preview',destructive:true,spendCapRequired:false,scopes:['quote:preview'],inputSchema:{type:'object'}}]};
const identity=createDelegatedAgentIdentity({principalId:'doctor-founder',agentId:'doctor-agent',scopes:['quote:preview'],spendCap:0,expiresAt:'2026-09-13T19:00:00Z'});
const manifest=buildAgentCommerceManifest(product);
const dryRun=identity.ok?executeAgentCommand({product,identity:identity.data,commandName:'quote',input:{amount:0},dryRun:true,now}):identity;
const ok=Boolean(identity.ok&&dryRun.ok&&dryRun.status==='DRY_RUN_OK');
const result={ok,status:ok?'AGENT_NATIVE_COMMERCE_DRY_RUN_READY':'AGENT_NATIVE_COMMERCE_DRY_RUN_BLOCKED',manifestRevision:manifest.revisionHash,identityStatus:identity.status,dryRunStatus:dryRun.status,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'This doctor exercises discovery, attenuated identity and dry-run command admission only. It never invokes a command executor and proves no customer, payment, messaging, spend or external effect.'};
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
if(!ok)process.exitCode=2;
