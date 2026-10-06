import test from 'node:test';
import assert from 'node:assert/strict';
import { promoteOwnerBusinessIdentityFromEnv } from '../src/owner-business-identity-runtime.mjs';

function store(initial={}){
  const settings=structuredClone(initial);const logs=[];
  return {
    settings,logs,
    async getSettings(){return structuredClone(settings);},
    async setSetting(key,value){settings[key]=structuredClone(value);return value;},
    async log(event,detail){logs.push({event,detail:structuredClone(detail)});}
  };
}

const ENV={
  UBERBOND_OWNER_LEGAL_NAME:'Mohamed Wessam',
  UBERBOND_OWNER_PUBLIC_POSTAL_ADDRESS:'Beverly Hills 172 Al montazah',
  UBERBOND_OWNER_SENDER_NAME:'Wessam Solomon',
  UBERBOND_OWNER_COMPANY:'UberBond',
  UBERBOND_OWNER_FOOTER_USE_AUTHORIZED:'true'
};

test('protected runtime promotes only exact explicitly authorized identity values',async()=>{
  const s=store();
  const result=await promoteOwnerBusinessIdentityFromEnv({store:s,env:ENV,now:new Date('2026-10-04T21:30:00Z')});
  assert.equal(result.ok,true);assert.equal(result.updated,true);assert.equal(result.footerUseAuthorized,true);
  assert.deepEqual(s.settings.businessIdentity,{
    legalName:'Mohamed Wessam',senderName:'Wessam Solomon',company:'UberBond',postalAddress:'Beverly Hills 172 Al montazah',footerUseAuthorized:true,updatedAt:'2026-10-04T21:30:00.000Z',source:'owner-protected-runtime-env'
  });
  assert.equal(JSON.stringify(s.logs).includes('Beverly Hills'),false);
  assert.equal(JSON.stringify(s.logs).includes('Mohamed Wessam'),false);
  assert.equal(result.externalEffects,0);assert.equal(result.businessEffectAuthority,'NONE');
});

test('footer authorization must be explicit and partial identity fails closed',async()=>{
  const s=store();
  const noAuth=await promoteOwnerBusinessIdentityFromEnv({store:s,env:{...ENV,UBERBOND_OWNER_FOOTER_USE_AUTHORIZED:'false'}});
  assert.equal(noAuth.ok,false);assert.ok(noAuth.reasonCodes.includes('explicit-footer-publication-authorization-required'));
  assert.equal(s.settings.businessIdentity,undefined);
  const noAddress=await promoteOwnerBusinessIdentityFromEnv({store:s,env:{...ENV,UBERBOND_OWNER_PUBLIC_POSTAL_ADDRESS:''}});
  assert.equal(noAddress.ok,false);assert.ok(noAddress.reasonCodes.includes('owner-public-postal-address-required'));
  assert.equal(s.settings.businessIdentity,undefined);
});

test('absent runtime identity is a no-op and current exact identity is idempotent',async()=>{
  const s=store();
  const absent=await promoteOwnerBusinessIdentityFromEnv({store:s,env:{}});
  assert.equal(absent.status,'OWNER_IDENTITY_RUNTIME_NOT_CONFIGURED');assert.equal(absent.updated,false);
  await promoteOwnerBusinessIdentityFromEnv({store:s,env:ENV,now:new Date('2026-10-04T21:30:00Z')});
  const again=await promoteOwnerBusinessIdentityFromEnv({store:s,env:ENV,now:new Date('2026-10-04T22:00:00Z')});
  assert.equal(again.status,'OWNER_IDENTITY_RUNTIME_ALREADY_CURRENT');assert.equal(again.updated,false);
});
