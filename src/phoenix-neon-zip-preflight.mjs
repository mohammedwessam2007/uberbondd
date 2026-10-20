/**
 * PHOENIX pre-release static validation for Neon Node.js24 function ZIPs.
 * No extraction, execution, networking, secret access or deployment.
 * A good ZIP is not proof that its code runs, that credentials work or that
 * sending is authorized.
 */
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

const MAX_ZIP_BYTES = 8 * 1024 * 1024;
const MAX_ENTRY_COUNT = 4000;
const MAX_ENTRY_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const ENTRYPOINTS = new Set(['index.js', 'index.mjs']);
const MAGIC_LOCAL = 0x04034b50;
const MAGIC_CENTRAL = 0x02014b50;
const MAGIC_END = 0x06054b50;
const uint16 = (b, at) => b.readUInt16LE(at);
const uint32 = (b, at) => b.readUInt32LE(at);
const fail = (reason, extra={}) => ({ok:false,status:'PHOENIX_NEON_BUNDLE_REFUSED',reason,...extra,
  releaseAuthority:'NONE',deployed:false,externalEffects:'NONE'});
const crcTable = new Uint32Array(256);
for (let i=0;i<256;i++){
  let x=i;for(let j=0;j<8;j++)x=(x&1)?(0xedb88320^(x>>>1)):(x>>>1);crcTable[i]=x>>>0;
}
function crc32(bytes){let c=0xffffffff;for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function safeName(name){
  if(!name || name.length>500 || /[\\\u0000-\u001f\u007f\ufffd]/.test(name) || name.startsWith('/') || /^[a-z]:/i.test(name))return false;
  const dir=name.endsWith('/');
  const parts=(dir?name.slice(0,-1):name).split('/');
  return parts.every(p=>p.length>0&&p!=='.'&&p!=='..'&&!/^(?:\.env(?:\..+)?|\.git|\.ssh|id_rsa|id_ed25519)$/i.test(p));
}
const validSha = x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);

export function inspectPhoenixNeonZip(raw, {expectedSha256=null}={}) {
  if(!Buffer.isBuffer(raw)||raw.length<22||raw.length>MAX_ZIP_BYTES)return fail('BUNDLE_BYTES_MISSING_OR_OUT_OF_BOUNDS');
  if(expectedSha256!==null&&!validSha(expectedSha256))return fail('INVALID_EXPECTED_SHA256');
  const observedSha256=createHash('sha256').update(raw).digest('hex');
  if(expectedSha256 && observedSha256!==expectedSha256)return fail('PINNED_BUNDLE_SHA256_MISMATCH',{observedSha256});
  let eocd=-1;
  for(let p=raw.length-22;p>=Math.max(0,raw.length-65557);p--){
    if(uint32(raw,p)===MAGIC_END && p+22+uint16(raw,p+20)===raw.length){eocd=p;break;}
  }
  if(eocd<0)return fail('ZIP_END_RECORD_MISSING');
  if(uint16(raw,eocd+4)!==0||uint16(raw,eocd+6)!==0)return fail('SPANNED_ZIP_UNSUPPORTED');
  const n=uint16(raw,eocd+10), cdsize=uint32(raw,eocd+12), cdstart=uint32(raw,eocd+16);
  if(n===0||n>MAX_ENTRY_COUNT||n!==uint16(raw,eocd+8)||cdsize===0||cdsize===0xffffffff||cdstart===0xffffffff||
     cdstart+cdsize!==eocd)return fail('ZIP_CENTRAL_DIRECTORY_INVALID');
  const names=new Set(), entrypoints=[], ranges=[];
  let offset=cdstart,totalUncompressed=0,files=0;
  for(let i=0;i<n;i++){
    if(offset+46>eocd||uint32(raw,offset)!==MAGIC_CENTRAL)return fail('ZIP_CENTRAL_RECORD_INVALID');
    const requiredVersion=uint16(raw,offset+6),flags=uint16(raw,offset+8),method=uint16(raw,offset+10);
    const crc=uint32(raw,offset+16),compressed=uint32(raw,offset+20),uncompressed=uint32(raw,offset+24);
    const nl=uint16(raw,offset+28),extra=uint16(raw,offset+30),comment=uint16(raw,offset+32);
    const disk=uint16(raw,offset+34),external=uint32(raw,offset+38),local=uint32(raw,offset+42);
    const end=offset+46+nl+extra+comment;
    if(end>eocd||nl===0||requiredVersion>20||disk!==0||local===0xffffffff||compressed===0xffffffff||uncompressed===0xffffffff||
       (flags&0x41)!==0||![0,8].includes(method))return fail('ZIP_UNSUPPORTED_OR_UNSAFE_ENTRY');
    const name=raw.subarray(offset+46,offset+46+nl).toString('utf8');
    if(!safeName(name))return fail('ZIP_UNSAFE_OR_SECRET_FILENAME');
    const normalized=name.toLowerCase();
    if(names.has(normalized))return fail('ZIP_DUPLICATE_ENTRY');
    names.add(normalized);
    if(((external>>>16)&0o170000)===0o120000)return fail('ZIP_SYMLINK_REFUSED');
    if(uncompressed>MAX_ENTRY_BYTES||compressed>MAX_ZIP_BYTES||uncompressed>compressed*1000+1024)return fail('ZIP_DECOMPRESSION_BUDGET_EXCEEDED');
    totalUncompressed+=uncompressed;
    if(totalUncompressed>MAX_TOTAL_BYTES)return fail('ZIP_TOTAL_DECOMPRESSION_BUDGET_EXCEEDED');
    if(local+30>cdstart||uint32(raw,local)!==MAGIC_LOCAL)return fail('ZIP_LOCAL_HEADER_MISSING');
    const lflags=uint16(raw,local+6),lm=uint16(raw,local+8),lname=uint16(raw,local+26),lextra=uint16(raw,local+28);
    if((lflags&0x41)!==0||lflags!==flags||lm!==method||lname!==nl||
       local+30+lname+lextra+compressed>cdstart||
       !raw.subarray(local+30,local+30+nl).equals(raw.subarray(offset+46,offset+46+nl)))return fail('ZIP_LOCAL_CENTRAL_INCONSISTENCY');
    if((flags&8)===0&&(uint32(raw,local+14)!==crc||uint32(raw,local+18)!==compressed||uint32(raw,local+22)!==uncompressed))return fail('ZIP_LOCAL_METADATA_CONTRADICTION');
    const start=local+30+lname+lextra;
    ranges.push([local,start+compressed]);
    if(name.endsWith('/')){
      if(uncompressed!==0||compressed!==0)return fail('ZIP_DIRECTORY_WITH_PAYLOAD');
    }else{
      files++;
      let extracted;
      try{extracted=method===0?raw.subarray(start,start+compressed):inflateRawSync(raw.subarray(start,start+compressed),{maxOutputLength:MAX_ENTRY_BYTES+1});}
      catch{return fail('ZIP_DECOMPRESSION_FAILED');}
      if(extracted.length!==uncompressed||crc32(extracted)!==crc)return fail('ZIP_PAYLOAD_CHECKSUM_OR_SIZE_FAILED');
      if(ENTRYPOINTS.has(name)){
        if(extracted.length<1)return fail('ZIP_EMPTY_ENTRYPOINT');
        entrypoints.push(name);
      }
    }
    offset=end;
  }
  if(offset!==eocd)return fail('ZIP_UNPARSED_CENTRAL_BYTES');
  ranges.sort((a,b)=>a[0]-b[0]);
  for(let j=1;j<ranges.length;j++)if(ranges[j][0]<ranges[j-1][1])return fail('ZIP_OVERLAPPING_LOCAL_RECORDS');
  if(entrypoints.length!==1)return fail('NEON_ROOT_ENTRYPOINT_REQUIRED',{observedRootEntrypointCount:entrypoints.length});
  return {ok:true,status:'PHOENIX_NEON_BUNDLE_STATIC_PREFLIGHT_PASSED',observedSha256,
    pinnedSha256Matched:expectedSha256!==null,entrypoint:entrypoints[0],entryCount:n,fileCount:files,
    totalUncompressedBytes:totalUncompressed,releaseAuthority:'NONE',deployed:false,
    externalEffects:'NONE',limitations:'Does not validate runtime execution, code provenance, secret absence inside source, database binding, provider identity, sender authority or deployability.'};
}
