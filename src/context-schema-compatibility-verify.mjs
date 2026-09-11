import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileContextSchemaCompatibility, CONTEXT_SCHEMA_COMPATIBILITY_RECEIPT_SCHEMA } from './context-schema-compatibility.mjs';

const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='CONTEXT_SCHEMA_COMPATIBILITY_INVALID'){return{ok:false,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};}

export function verifyContextSchemaCompatibility(receipt){
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||receipt.schemaVersion!==CONTEXT_SCHEMA_COMPATIBILITY_RECEIPT_SCHEMA)return fail(['canonical-schema-compatibility-receipt-required']);
  if(receipt.compatibilityMode!=='EXACT_REGISTERED_SCHEMA_ONLY'||receipt.migrationApplied!==false)return fail(['exact-registered-schema-mode-required']);
  if(receipt.consequenceAuthority!=='NONE'||receipt.businessEffectAuthority!=='NONE'||receipt.externalEffectAuthority!=='NONE')return fail(['zero-schema-compatibility-authority-required']);
  const rebuilt=compileContextSchemaCompatibility({contextAbiVersion:receipt.contextAbiVersion,schemas:receipt.observedSchemas});
  if(!rebuilt.ok||rebuilt.receipt.receiptId!==receipt.receiptId)return fail(['schema-compatibility-recompile-mismatch']);
  return{ok:true,status:'CONTEXT_SCHEMA_COMPATIBILITY_VERIFIED',receiptId:receipt.receiptId,contextAbiVersion:receipt.contextAbiVersion,observedSchemas:receipt.observedSchemas,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}
