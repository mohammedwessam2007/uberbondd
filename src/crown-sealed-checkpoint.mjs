import crypto from 'node:crypto';
const derive=key=>{if(typeof key!=='string'||key.length<32)throw Error('private-sealed-checkpoint-key-required');return crypto.createHash('sha256').update('uberbond.sealed-crown.v1:'+key).digest();};
export function sealCrownCheckpoint(payload,{key,binding}){
 if(typeof binding!=='string'||!binding)throw Error('sealed-checkpoint-binding-required');
 const raw=JSON.stringify(payload);if(Buffer.byteLength(raw)>500000)throw Error('sealed-checkpoint-size-refused');
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',derive(key),iv);cipher.setAAD(Buffer.from(binding));
 const ciphertext=Buffer.concat([cipher.update(raw,'utf8'),cipher.final()]);
 return {schemaVersion:'uberbond.sealed-crown-checkpoint.v1',binding,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
export function openCrownCheckpoint(receipt,{key,binding}){
 if(receipt?.schemaVersion!=='uberbond.sealed-crown-checkpoint.v1'||receipt.binding!==binding)throw Error('sealed-checkpoint-binding-mismatch');
 const decipher=crypto.createDecipheriv('aes-256-gcm',derive(key),Buffer.from(receipt.iv,'base64'));decipher.setAAD(Buffer.from(binding));decipher.setAuthTag(Buffer.from(receipt.tag,'base64'));
 return JSON.parse(Buffer.concat([decipher.update(Buffer.from(receipt.ciphertext,'base64')),decipher.final()]).toString('utf8'));
}
