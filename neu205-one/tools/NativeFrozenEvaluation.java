package ai.neu205.one;

import ai.neu205.one.evidence.EvidenceIndex;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.json.*;

/** Private question-only, resumable host runner for the actual Android NativeBrain path.
 * Never reads a key, assigns medical grades, or invokes a network/provider/phone.
 */
public final class NativeFrozenEvaluation {
 static final String MODEL="00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4";
 static final String PDF="c3298e8c5f7f807604be10f7376d67f05eb315dd982276263e8f6ad2e8e70940";
 static String hash(InputStream in)throws Exception {try(in){MessageDigest h=MessageDigest.getInstance("SHA-256");byte[] b=new byte[4*1024*1024];int n;while((n=in.read(b))!=-1)h.update(b,0,n);return hex(h.digest());}}
 static String hash(Path p)throws Exception{return hash(Files.newInputStream(p));}
 static String hex(byte[] b){StringBuilder s=new StringBuilder();for(byte x:b)s.append(String.format(Locale.ROOT,"%02x",x&255));return s.toString();}
 static String hashText(String text)throws Exception{return hash(new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8)));}
 static String classHash(Class<?> c)throws Exception{return hash(c.getResourceAsStream(c.getSimpleName()+".class"));}
 static List<JSONObject> questions(Path p)throws Exception {
  List<JSONObject> rows=new ArrayList<>();Set<String> ids=new HashSet<>();
  for(String line:Files.readAllLines(p,StandardCharsets.UTF_8)){if(line.isBlank())continue;JSONObject r=new JSONObject(line);if(!r.keySet().equals(Set.of("id","question")))throw new IOException("Question-only schema required");String id=r.getString("id"),q=r.getString("question");if(id.isBlank() || !ids.add(id) || q.isBlank() || q.length()>1000)throw new IOException("Invalid question identity or length");rows.add(r);}
  if(rows.isEmpty())throw new IOException("No evaluation questions");return rows;
 }
 static Set<String> audit(Path output,Set<String> ids,String configSha)throws Exception {
  Set<String> done=new HashSet<>();if(!Files.exists(output))return done;
  try(BufferedReader in=Files.newBufferedReader(output,StandardCharsets.UTF_8)){
   String first=in.readLine();if(first==null)throw new IOException("Empty journal preserved; recover independently");JSONObject header=new JSONObject(first);
   if(!header.keySet().equals(Set.of("run","config_sha256")) || !configSha.equals(header.getString("config_sha256")) || !configSha.equals(hashText(header.getJSONObject("run").toString())))throw new IOException("Frozen journal configuration differs");
   String line;while((line=in.readLine())!=null){if(line.isBlank())throw new IOException("Blank/torn journal row preserved");JSONObject r=new JSONObject(line);String id=r.getString("id");if(!ids.contains(id) || !done.add(id) || !Set.of("completed","failed").contains(r.getString("status")) || !(r.get("answer") instanceof String))throw new IOException("Unknown, duplicate or malformed journal row");}
  }
  return done;
 }
 static void append(FileOutputStream out,JSONObject row)throws Exception {out.write((row.toString()+"\n").getBytes(StandardCharsets.UTF_8));out.flush();out.getFD().sync();}
 static void progress(Path p,int done,int total,String config)throws Exception {
  Path temp=p.resolveSibling(p.getFileName()+".new");byte[] b=new JSONObject().put("completed_rows",done).put("requested_rows",total).put("config_sha256",config).put("medical_grading_executed",false).toString().getBytes(StandardCharsets.UTF_8);
  try(FileOutputStream out=new FileOutputStream(temp.toFile())){out.write(b);out.getFD().sync();}
  Files.move(temp,p,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
 }
 public static void main(String[] a)throws Exception {
  if(a.length==4 && a[0].equals("--audit")){List<JSONObject> q=questions(Path.of(a[2]));Set<String> ids=new HashSet<>();for(var r:q)ids.add(r.getString("id"));System.out.println("AUDITED_ROWS="+audit(Path.of(a[1]),ids,a[3]).size());return;}
  if(a.length!=9)throw new IllegalArgumentException("model corpus corpusManifest pdf questions freezeManifest predictions sourceCommit nativeLibrary");
  Path model=Path.of(a[0]),corpus=Path.of(a[1]),corpusManifest=Path.of(a[2]),pdf=Path.of(a[3]),qs=Path.of(a[4]),freeze=Path.of(a[5]),output=Path.of(a[6]),library=Path.of(a[8]);
  if(!MODEL.equals(hash(model)) || Files.size(model)!=2740937888L || !PDF.equals(hash(pdf)))throw new IOException("Model or original PDF identity mismatch");
  List<JSONObject> rows=questions(qs);JSONObject frozen=new JSONObject(Files.readString(freeze));
  if(!hash(qs).equals(frozen.getString("questions_sha256")) || rows.size()!=frozen.getInt("total"))throw new IOException("Question set differs from frozen key manifest");
  EvidenceIndex index;try(InputStream c=Files.newInputStream(corpus);InputStream m=Files.newInputStream(corpusManifest)){index=EvidenceIndex.load(c,m);}
  if(index.loadError()!=null)throw new IOException("Verified corpus index failed");
  JSONObject config=new JSONObject().put("scope","HOST_ACTUAL_NATIVE_BRAIN_NOT_PHONE").put("source_commit",a[7]).put("model_sha256",MODEL).put("corpus_sha256",index.corpusSha256()).put("questions_sha256",hash(qs)).put("key_manifest_sha256",hash(freeze)).put("sealed_key_sha256",frozen.getString("gold_sha256")).put("jni_sha256",hash(library)).put("native_brain_class_sha256",classHash(NativeBrain.class)).put("native_qwen_class_sha256",classHash(NativeQwen.class)).put("speech_class_sha256",classHash(SpeechClauses.class)).put("runner_class_sha256",classHash(NativeFrozenEvaluation.class)).put("evidence_class_sha256",classHash(EvidenceIndex.class)).put("bm25_class_sha256",classHash(ai.neu205.one.evidence.Bm25.class)).put("json_parser_class_sha256",classHash(ai.neu205.one.core.MiniJson.class)).put("android_json_class_sha256",classHash(JSONObject.class)).put("android_asset_activation","HOST_DIRECT_VERIFIED_BYTES_NOT_SAF_TEST").put("context",2048).put("threads",4).put("prefill_chunk",64).put("max_tokens",180).put("sampling","greedy").put("question_deadline_seconds",120).put("history","empty_each_question").put("confidence","NOT_EXPORTED_BY_NATIVE_PATH");
  String configSha=hashText(config.toString());Set<String> ids=new HashSet<>();for(var r:rows)ids.add(r.getString("id"));Set<String> done=audit(output,ids,configSha);
  Path parent=output.toAbsolutePath().getParent();Files.createDirectories(parent);try{Files.setPosixFilePermissions(parent,java.nio.file.attribute.PosixFilePermissions.fromString("rwx------"));}catch(UnsupportedOperationException ignored){}
  boolean fresh=!Files.exists(output);if(fresh){Files.createFile(output);Files.setPosixFilePermissions(output,java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));}
  Path counter=output.resolveSibling(output.getFileName()+".progress.json");
  try(FileOutputStream journal=new FileOutputStream(output.toFile(),true)){
   if(fresh)append(journal,new JSONObject().put("run",config).put("config_sha256",configSha));
   progress(counter,done.size(),rows.size(),configSha);
   if(done.size()==rows.size()){System.out.println("ALREADY_COMPLETE rows="+done.size());return;}
   ScheduledExecutorService timer=Executors.newSingleThreadScheduledExecutor();
   try(NativeBrain brain=new NativeBrain(new NativeQwen(model.toString(),4),index,null)){
    for(JSONObject q:rows){String id=q.getString("id");if(done.contains(id))continue;
     StringBuilder answer=new StringBuilder();JSONArray[] pages={new JSONArray()};long start=System.nanoTime();long[] first={-1};AtomicBoolean expired=new AtomicBoolean();String error=null;
     brain.prepare();Object deadlineLock=new Object();boolean[] active={true};ScheduledFuture<?> deadline=timer.schedule(()->{synchronized(deadlineLock){if(active[0]){expired.set(true);brain.cancel();}}},120,TimeUnit.SECONDS);
     try{brain.answer(q.getString("question"),new JSONArray(),new JSONArray(),new NativeBrain.Output(){public void pages(String p){try{pages[0]=new JSONArray(p);}catch(JSONException bad){throw new IllegalStateException(bad);}}public void text(String t){if(first[0]<0)first[0]=System.nanoTime();if(answer.length()>0)answer.append(' ');answer.append(t);}});if(expired.get())error="NATIVE_DEADLINE";else if(answer.toString().isBlank())error="EMPTY_NATIVE_ANSWER";}
     catch(Exception failed){error=failed.getClass().getSimpleName()+":"+Objects.toString(failed.getMessage(),"");}
     finally{synchronized(deadlineLock){active[0]=false;}deadline.cancel(false);}
     JSONObject result=new JSONObject().put("id",id).put("answer",answer.toString()).put("status",error==null?"completed":"failed").put("confidence",JSONObject.NULL).put("source_pages",pages[0]).put("elapsed_ms",(System.nanoTime()-start)/1e6).put("first_speech_clause_ms",first[0]<0?JSONObject.NULL:(first[0]-start)/1e6).put("error",error==null?JSONObject.NULL:error);
     append(journal,result);done.add(id);progress(counter,done.size(),rows.size(),configSha);System.out.println("DURABLE_ROWS="+done.size()+"/"+rows.size()+" status="+result.getString("status"));
    }
   }finally{timer.shutdownNow();}
  }
  System.out.println("NATIVE_PREDICTIONS_COMPLETE count="+done.size()+" sha256="+hash(output));
 }
}
