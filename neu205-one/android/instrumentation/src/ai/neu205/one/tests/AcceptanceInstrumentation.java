package ai.neu205.one.tests;
import android.app.*;import android.os.Bundle;import android.content.*;import android.content.pm.PackageManager;import android.view.*;import android.widget.*;
/** Runs only on an explicitly selected emulator/device; does not grant any permission. */
public final class AcceptanceInstrumentation extends Instrumentation {
 private int checks;private boolean nativeProbe;
 @Override public void onCreate(Bundle args){super.onCreate(args);nativeProbe=args!=null && "true".equals(args.getString("native_probe"));start();}
 private void require(boolean condition,String check){if(!condition)throw new AssertionError(check);checks++;Bundle status=new Bundle();status.putString("check",check);sendStatus(0,status);}
 @Override public void onStart(){Bundle result=new Bundle();Activity a=null;try{
  Context target=getTargetContext();require(target.checkSelfPermission("android.permission.RECORD_AUDIO")==PackageManager.PERMISSION_DENIED,"First installation has no microphone permission");
  if(nativeProbe){
   Class<?> qwen=Class.forName("ai.neu205.one.NativeQwen",true,target.getClassLoader());
   require(qwen!=null,"Actual Android native Qwen library loads");
   for(int i=0;i<3;i++){
    try{qwen.getConstructor(String.class,int.class).newInstance(target.getFilesDir()+"/missing-probe.gguf",1);throw new AssertionError("Missing GGUF accepted");}
    catch(java.lang.reflect.InvocationTargetException expected){require(expected.getCause() instanceof java.io.IOException,"Actual JNI rejects missing model without activation");}
   }
   try{qwen.getConstructor(String.class,int.class,java.util.concurrent.atomic.AtomicBoolean.class).newInstance("/unused",1,new java.util.concurrent.atomic.AtomicBoolean(true));throw new AssertionError("Cancelled startup accepted");}
   catch(java.lang.reflect.InvocationTargetException expected){require(expected.getCause() instanceof java.io.InterruptedIOException,"Cancelled startup cannot activate a model");}
  }
  Intent launch=new Intent().setClassName("ai.neu205.one","ai.neu205.one.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);a=startActivitySync(launch);waitForIdleSync();require(a!=null,"Native activity launches");
  Activity activity=a;runOnMainSync(()->require(find(activity.getWindow().getDecorView(),"Start")!=null,"Single Start control visible"));
  runOnMainSync(()->{Button b=find(activity.getWindow().getDecorView(),"Start");b.performClick();});waitForIdleSync();
  require(target.checkSelfPermission("android.permission.RECORD_AUDIO")==PackageManager.PERMISSION_DENIED,"Start without pairing never requests or grants microphone");
  runOnMainSync(()->require(find(activity.getWindow().getDecorView(),"Save pairing")!=null,"Missing pairing exposes actionable setup"));
  result.putInt("checks",checks);result.putString("stream","PASS: UI and permission gates; no audio/Qwen/phone proof.");finish(Activity.RESULT_OK,result);
 }catch(Throwable e){result.putInt("checks",checks);result.putString("stream","FAIL: "+e.getClass().getSimpleName()+": "+e.getMessage());finish(Activity.RESULT_CANCELED,result);}finally{if(a!=null){Activity end=a;runOnMainSync(end::finish);}}}
 private Button find(View v,String text){if(v instanceof Button && text.contentEquals(((Button)v).getText()))return (Button)v;if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++){Button b=find(g.getChildAt(i),text);if(b!=null)return b;}}return null;}
}
