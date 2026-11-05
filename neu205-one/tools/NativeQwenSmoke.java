package ai.neu205.one;

import java.nio.file.*;
import java.security.*;
import java.io.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Real model plumbing probe on synthetic passages. Never a held-out medical evaluation. */
public final class NativeQwenSmoke {
 static String prompt(String question,String passage){return "<|im_start|>system\nAnswer using only the supplied passage. If it does not support the answer, say you could not find sufficient evidence. Never give treatment instructions. Use at most two short sentences. Do not emit reasoning.<|im_end|>\n<|im_start|>user\nPassage: "+passage+"\nQuestion: "+question+"<|im_end|>\n<|im_start|>assistant\n<think>\n</think>\n\n";}
 static void cancel(NativeQwen q,String prompt,int stage)throws Exception {
  q.prepare();AtomicReference<Throwable> error=new AtomicReference<>();AtomicInteger callbacks=new AtomicInteger();
  Thread worker=new Thread(()->{try{q.answer(prompt,b->callbacks.incrementAndGet());}catch(Throwable t){error.set(t);}});
  worker.start();long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(90);
  while(q.stage()!=stage && worker.isAlive() && System.nanoTime()<deadline)Thread.sleep(1);
  if(q.stage()!=stage){q.cancel();worker.join(10000);throw new AssertionError("Did not observe native stage "+stage);}
  Thread.sleep(100); // Observe work underway, not just the transition into a stage.
  if(q.stage()!=stage){q.cancel();worker.join(10000);throw new AssertionError("Native stage ended before the cancellation probe");}
  long start=System.nanoTime();q.cancel();int atCancel=callbacks.get();worker.join(5000);
  double ms=(System.nanoTime()-start)/1e6;
  if(worker.isAlive() || error.get()!=null || callbacks.get()!=atCancel)throw new AssertionError("Cancellation failed",error.get());
  System.out.printf("CANCEL stage=%d join_ms=%.3f late_callbacks=0%n",stage,ms);
 }
 public static void main(String[] args)throws Exception {
  Path model=Path.of(args[0]);MessageDigest hash=MessageDigest.getInstance("SHA-256");
  try(InputStream in=Files.newInputStream(model)){byte[] b=new byte[4*1024*1024];int n;while((n=in.read(b))!=-1)hash.update(b,0,n);}
  if(Files.size(model)!=2740937888L || !java.util.HexFormat.of().formatHex(hash.digest()).equals("00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4"))throw new AssertionError("Unverified model");
  try(NativeQwen q=new NativeQwen(model.toString(),4)){
   for(String question:new String[]{"What change does the carotid body detect?","What aspirin dose should I take?"}){
    ByteArrayOutputStream out=new ByteArrayOutputStream();q.prepare();long start=System.nanoTime();
    q.answer(prompt(question,"The carotid body detects decreased arterial oxygen and signals respiratory centers to increase ventilation."),b->out.write(b,0,b.length));
    System.out.printf("SYNTHETIC_PROBE elapsed_ms=%.3f answer=%s%n",(System.nanoTime()-start)/1e6,out.toString(java.nio.charset.StandardCharsets.UTF_8));
   }
   cancel(q,prompt("Summarize this passage.","The neuron transmits signals. ".repeat(180)),1);
   cancel(q,prompt("Explain the passage in two sentences.","The carotid body detects decreased arterial oxygen and signals respiratory centers to increase ventilation."),2);
   q.prepare();q.cancel();AtomicInteger late=new AtomicInteger();q.answer(prompt("What?","A passage."),b->late.incrementAndGet());if(late.get()!=0)throw new AssertionError("Pre-start cancellation lost");
   try{q.prepare();q.answer("neuron ".repeat(3000),b->{});throw new AssertionError("Context overflow accepted");}catch(IOException expected){System.out.println("CONTEXT_OVERFLOW refused");}
  }
  System.out.println("NATIVE_SMOKE_PASS synthetic plumbing only; medical accuracy and phone NOT TESTED");
 }
}
