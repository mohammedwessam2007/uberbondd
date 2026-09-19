import path from 'node:path';

export const APPROVED_EMBEDDED_POSTGRES_VERSION='18.4.0-beta.17';

const SUPPORTED=Object.freeze({
  'linux:x64':'linux-x64',
  'linux:arm64':'linux-arm64'
});

export function resolveEmbeddedPostgresPlatform({
  platform=process.platform,
  arch=process.arch,
  cwd=process.cwd()
}={}){
  const key=`${String(platform)}:${String(arch)}`;
  const packageSlug=SUPPORTED[key]||null;
  if(!packageSlug){
    return Object.freeze({
      supported:false,
      platform:String(platform),
      arch:String(arch),
      reason:'UNREVIEWED_EMBEDDED_POSTGRES_PLATFORM'
    });
  }
  const packageName=`@embedded-postgres/${packageSlug}`;
  const packageRoot=path.resolve(cwd,'node_modules','@embedded-postgres',packageSlug);
  return Object.freeze({
    supported:true,
    platform:String(platform),
    arch:String(arch),
    packageSlug,
    packageName,
    packageSpec:`${packageName}@${APPROVED_EMBEDDED_POSTGRES_VERSION}`,
    packageRoot,
    nativeDir:path.join(packageRoot,'native'),
    nativeLibDir:path.join(packageRoot,'native','lib')
  });
}

export function approvedEmbeddedPostgresBuildScripts(){
  return Object.freeze({
    [`@embedded-postgres/linux-x64@${APPROVED_EMBEDDED_POSTGRES_VERSION}`]:true,
    [`@embedded-postgres/linux-arm64@${APPROVED_EMBEDDED_POSTGRES_VERSION}`]:true
  });
}
