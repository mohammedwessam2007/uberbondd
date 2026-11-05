package ai.neu205.one;
import android.content.Context;import ai.neu205.one.core.audio.WhisperTokens;import java.io.*;import java.nio.charset.StandardCharsets;import java.security.*;import java.util.*;
/** Verified private APK assets; atomic one-time extraction into private app storage. */
final class NativeAsr {
 private static WhisperOnnx instance;
 static synchronized void invalidate()throws Exception {if(instance!=null){instance.cancelInference();instance.close();instance=null;}}
 static synchronized WhisperOnnx load(Context ctx)throws Exception {
  if(instance!=null)return instance;
  Properties cfg=new Properties();try(InputStream in=AssetRepository.open(ctx,"models/whisper/config.properties")){cfg.load(in);}
  File dir=new File(ctx.getFilesDir(),"whisper-one");if(!dir.isDirectory() && !dir.mkdirs())throw new IOException("ASR storage unavailable");
  File encoder=install(ctx,dir,"encoder.onnx",cfg.getProperty("encoder_sha256"));File decoder=install(ctx,dir,"decoder.onnx",cfg.getProperty("decoder_sha256"));
  File tokenFile=install(ctx,dir,"tokens.txt",cfg.getProperty("tokens_sha256"));List<String> tokens;try(InputStream in=new FileInputStream(tokenFile)){tokens=Arrays.asList(ConversationService.read(in,2_000_000).split("\n",-1));}
  String suppression=cfg.getProperty("suppress","");int[] suppress=suppression.isEmpty()?new int[0]:Arrays.stream(suppression.split(",")).map(String::trim).mapToInt(Integer::parseInt).toArray();
  instance=new WhisperOnnx(encoder.getPath(),decoder.getPath(),new WhisperTokens(tokens),Integer.parseInt(cfg.getProperty("layers","12")),Integer.parseInt(cfg.getProperty("heads","12")),Integer.parseInt(cfg.getProperty("headDim","64")),suppress,Math.max(1,Math.min(4,Runtime.getRuntime().availableProcessors()-1)));
  String prompt=cfg.getProperty("prompt_ids","");if(!prompt.isEmpty())instance.setVocabularyPrompt(Arrays.stream(prompt.split(",")).map(String::trim).mapToLong(Long::parseLong).toArray());
  return instance;
 }
 private static File install(Context ctx,File dir,String name,String expected)throws Exception {
  if(expected==null || !expected.matches("[a-f0-9]{64}"))throw new IOException("ASR manifest invalid");
  File imported=AssetRepository.importedAsr(ctx,name);if(imported!=null){if(!digest(imported).equals(expected))throw new IOException("Imported ASR checksum mismatch");return imported;}
  File dest=new File(dir,name);if(dest.isFile() && digest(dest).equals(expected))return dest;
  File tmp=new File(dir,name+".partial");try(InputStream in=ctx.getAssets().open("models/whisper/"+name);FileOutputStream out=new FileOutputStream(tmp)){byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1){if(Thread.currentThread().isInterrupted())throw new InterruptedIOException("ASR import cancelled");out.write(buffer,0,n);}out.getFD().sync();}catch(Exception e){tmp.delete();throw e;}
  if(!digest(tmp).equals(expected)){tmp.delete();throw new IOException("ASR checksum mismatch");}
  try{java.nio.file.Files.move(tmp.toPath(),dest.toPath(),java.nio.file.StandardCopyOption.ATOMIC_MOVE,java.nio.file.StandardCopyOption.REPLACE_EXISTING);}catch(Exception failed){tmp.delete();throw new IOException("ASR atomic import failed; the previous verified asset was preserved",failed);}return dest;
 }
 private static String digest(File f)throws Exception {MessageDigest h=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(f)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)h.update(b,0,n);}StringBuilder s=new StringBuilder();for(byte b:h.digest())s.append(String.format(Locale.ROOT,"%02x",b&255));return s.toString();}
}
