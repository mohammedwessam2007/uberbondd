package ai.neu205.one;

import ai.neu205.one.imports.*;
import android.content.Context;
import android.content.pm.*;
import java.io.*;
import java.security.*;
import java.security.cert.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** App-private imports use this APK's signing certificate, never a key supplied by the imported ZIP. */
final class AssetRepository {
    private static final AtomicBoolean importing=new AtomicBoolean();
    private static VerifiedPackStore.Pack cached;
    static boolean importing(){return importing.get();}
    static boolean beginImport(){return importing.compareAndSet(false,true);}
    static void endImport(){importing.set(false);}
    static File root(Context ctx){return new File(ctx.getFilesDir(),"verified-study-packs");}
    static VerifiedPackStore store(Context ctx)throws Exception{return new VerifiedPackStore(root(ctx),signer(ctx));}
    private static PublicKey signer(Context ctx)throws Exception {
        PackageInfo info=ctx.getPackageManager().getPackageInfo(ctx.getPackageName(),PackageManager.GET_SIGNING_CERTIFICATES);
        if(info.signingInfo==null || info.signingInfo.getApkContentsSigners().length!=1)throw new IOException("Cannot establish this candidate's trusted signing identity");
        byte[] cert=info.signingInfo.getApkContentsSigners()[0].toByteArray();
        return CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(cert)).getPublicKey();
    }
    static synchronized VerifiedPackStore.Pack current(Context ctx)throws Exception {
        if(cached!=null)return cached;if(!new File(root(ctx),"active.json").isFile())return null;
        cached=store(ctx).current();return cached;
    }
    static void changed()throws Exception {synchronized(AssetRepository.class){cached=null;}CorpusAssets.invalidate();NativeAsr.invalidate();}
    static InputStream open(Context ctx,String path)throws Exception {
        VerifiedPackStore.Pack pack=current(ctx);if(pack!=null && pack.file(path).isFile())return new FileInputStream(pack.file(path));return ctx.getAssets().open(path);
    }
    static File importedAsr(Context ctx,String name)throws Exception {
        VerifiedPackStore.Pack pack=current(ctx);if(pack==null)return null;File file=pack.file("models/whisper/"+name);return file.isFile()?file:null;
    }
}
