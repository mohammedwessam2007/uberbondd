package ai.neu205.one;

import ai.neu205.one.imports.*;
import android.app.Activity;
import android.content.*;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.widget.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.*;

/** Owner-initiated SAF imports only. No permissions or companion files are modified. */
final class ImportController {
    static final int PACK=301,MODEL=302;
    private final Activity activity;private final TextView status;private final Handler main=new Handler(Looper.getMainLooper());
    private final AtomicBoolean cancelled=new AtomicBoolean();private volatile boolean destroyed;
    ImportController(Activity activity,LinearLayout panel){
        this.activity=activity;status=new TextView(activity);status.setTextColor(0xffc3d0cc);
        status.setText(R.string.private_import_intro);panel.addView(status);
        button(panel,"Import signed study pack",()->pick(PACK,"application/zip"));
        button(panel,"Restore previous imported pack",()->run(()->{AssetRepository.store(activity).rollback();AssetRepository.changed();return "Previous verified pack restored.";}));
        button(panel,"Validate existing Qwen GGUF",()->pick(MODEL,"*/*"));
        button(panel,"Cancel import",()->cancelled.set(true));
    }
    private interface Work {String call()throws Exception;}
    private void button(LinearLayout panel,String title,Runnable action){Button b=new Button(activity);b.setText(title);panel.addView(b);b.setOnClickListener(v->action.run());}
    private void pick(int request,String type){
        if(ConversationService.active() || AssetRepository.importing()){message("Stop conversation and wait for any import to finish first.");return;}
        if(request==MODEL){try{VerifiedPackStore.Pack p=AssetRepository.current(activity);if(p==null || !p.manifest.has("model")){message("Import the prepared signed pack containing the expected Qwen model receipt first.");return;}}catch(Exception e){message("Trusted pack unavailable: "+e.getMessage());return;}}
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType(type).addCategory(Intent.CATEGORY_OPENABLE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try{activity.startActivityForResult(intent,request);}catch(ActivityNotFoundException e){message("No document picker is available on this device.");}
    }
    void result(int request,int result,Intent data){
        if((request!=PACK && request!=MODEL) || result!=Activity.RESULT_OK || data==null || data.getData()==null)return;
        Uri uri=data.getData();run(()->{
            if(request==PACK){try(InputStream in=activity.getContentResolver().openInputStream(uri)){if(in==null)throw new IOException("Selected document is unavailable");AssetRepository.store(activity).install(in,cancelled,n->progress(n));}AssetRepository.changed();return "Signed study pack verified and activated. Original bundled assets remain intact.";}
            VerifiedPackStore.Pack pack=AssetRepository.current(activity);if(pack==null)throw new IOException("Signed model receipt is required");
            GgufReferenceValidator.Receipt expected=new GgufReferenceValidator.Receipt(pack.manifest.getJSONObject("model"));GgufReferenceValidator.Result checked;
            try(InputStream in=activity.getContentResolver().openInputStream(uri)){if(in==null)throw new IOException("Selected model is unavailable");checked=GgufReferenceValidator.verify(in,expected,cancelled,n->progress(n));}
            if(cancelled.get())throw new InterruptedIOException("Model verification cancelled");
            activity.getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);
            JSONObject reference=checked.metadata().put("document_uri",uri.toString()).put("pack_id",pack.id);
            File target=new File(activity.getFilesDir(),"qwen-document-reference.json"),temp=new File(activity.getFilesDir(),"qwen-document-reference.new");
            try{try(FileOutputStream out=new FileOutputStream(temp)){out.write(reference.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}Files.move(temp.toPath(),target.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}finally{temp.delete();}
            return "Qwen hash and GGUF header verified. Read-only reference retained; no weight copy created. Companion access is NOT verified: Termux requires a separately authorized shared file setup.";
        });
    }
    private void run(Work work){
        if(destroyed || ConversationService.active() || !AssetRepository.beginImport()){message("Stop conversation and wait for any import to finish first.");return;}
        cancelled.set(false);message("Verifying privately… Start is disabled until this operation finishes.");
        new Thread(()->{try{message(work.call());}catch(Exception e){message("Import not activated: "+e.getMessage());}finally{AssetRepository.endImport();}},"neu205-verified-import").start();
    }
    private long lastProgress;
    private void progress(long bytes){long now=android.os.SystemClock.elapsedRealtime();if(now-lastProgress>750){lastProgress=now;message("Verifying privately · "+(bytes/(1024*1024))+" MiB read. Cancel preserves previous assets.");}}
    private void message(String text){main.post(()->{if(!destroyed)status.setText(text);});}
    void destroy(){destroyed=true;cancelled.set(true);main.removeCallbacksAndMessages(null);}
}
