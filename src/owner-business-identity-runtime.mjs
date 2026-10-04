import crypto from 'node:crypto';

export const OWNER_BUSINESS_IDENTITY_RUNTIME_VERSION='uberbond.owner-business-identity-runtime.v1';
const clean=(value,max=500)=>String(value??'').trim().slice(0,max);
const truthy=value=>String(value??'').trim().toLowerCase()==='true';
const digest=value=>crypto.createHash('sha256').update(String(value??'')).digest('hex');

export async function promoteOwnerBusinessIdentityFromEnv({store,env=process.env,now=new Date()}={}){
  if(!store||typeof store.getSettings!=='function'||typeof store.setSetting!=='function'){
    return {ok:false,status:'OWNER_IDENTITY_RUNTIME_REFUSED',reasonCodes:['store-capabilities-required'],externalEffects:0};
  }
  const present=['UBERBOND_OWNER_LEGAL_NAME','UBERBOND_OWNER_PUBLIC_POSTAL_ADDRESS','UBERBOND_OWNER_SENDER_NAME','UBERBOND_OWNER_COMPANY','UBERBOND_OWNER_FOOTER_USE_AUTHORIZED']
    .some(key=>clean(env[key],1000));
  if(!present)return {ok:true,status:'OWNER_IDENTITY_RUNTIME_NOT_CONFIGURED',updated:false,externalEffects:0};

  const legalName=clean(env.UBERBOND_OWNER_LEGAL_NAME,180);
  const postalAddress=clean(env.UBERBOND_OWNER_PUBLIC_POSTAL_ADDRESS,500);
  const senderName=clean(env.UBERBOND_OWNER_SENDER_NAME,120);
  const company=clean(env.UBERBOND_OWNER_COMPANY,180)||legalName;
  const footerUseAuthorized=truthy(env.UBERBOND_OWNER_FOOTER_USE_AUTHORIZED);
  const reasonCodes=[];
  if(legalName.length<2)reasonCodes.push('owner-legal-name-required');
  if(postalAddress.length<12)reasonCodes.push('owner-public-postal-address-required');
  if(footerUseAuthorized!==true)reasonCodes.push('explicit-footer-publication-authorization-required');
  if(reasonCodes.length)return {ok:false,status:'OWNER_IDENTITY_RUNTIME_REFUSED',reasonCodes,updated:false,externalEffects:0};

  const settings=await store.getSettings();
  const existing=settings?.businessIdentity||{};
  const target={
    legalName,
    senderName,
    company,
    postalAddress,
    footerUseAuthorized:true,
    updatedAt:new Date(now).toISOString(),
    source:'owner-protected-runtime-env'
  };
  const same=existing.legalName===target.legalName
    && existing.senderName===target.senderName
    && existing.company===target.company
    && existing.postalAddress===target.postalAddress
    && existing.footerUseAuthorized===true;
  if(same)return {
    ok:true,status:'OWNER_IDENTITY_RUNTIME_ALREADY_CURRENT',updated:false,footerUseAuthorized:true,
    identityBindingDigest:digest(`${target.legalName}|${target.postalAddress}|${target.company}|${target.senderName}`),
    piiLogged:false,providerCalls:0,messagesSent:0,externalEffects:0,businessEffectAuthority:'NONE'
  };

  await store.setSetting('businessIdentity',target);
  if(typeof store.log==='function')await store.log('owner_business_identity_promoted_from_protected_runtime',{
    schemaVersion:OWNER_BUSINESS_IDENTITY_RUNTIME_VERSION,
    footerUseAuthorized:true,
    identityBindingDigest:digest(`${target.legalName}|${target.postalAddress}|${target.company}|${target.senderName}`),
    piiLogged:false,providerCalls:0,messagesSent:0,externalEffects:0
  });
  return {
    ok:true,status:'OWNER_IDENTITY_RUNTIME_PROMOTED',updated:true,footerUseAuthorized:true,
    identityBindingDigest:digest(`${target.legalName}|${target.postalAddress}|${target.company}|${target.senderName}`),
    piiLogged:false,providerCalls:0,messagesSent:0,externalEffects:0,businessEffectAuthority:'NONE',
    truthBoundary:'Only exact owner-supplied protected runtime values are promoted. No identity field is inferred; no provider, recipient, DNS, payment, or outbound effect is created.'
  };
}
