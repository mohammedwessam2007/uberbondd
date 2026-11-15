package ai.neu205.one;
import android.content.Context;import java.io.*;import java.security.*;import java.util.*;import org.json.*;
import ai.neu205.one.imports.VerifiedPackStore;
/** Source-derived corpus pinned by the signed candidate, distinct from the original PDF hash. */
final class CorpusAssets {
 // Recovered original-PDF-derived v05 corpus, verified against the private archive manifest.
 static final String EXPECTED="d886e87513dc930df05f827682acafb69da8957a919d3d27ea770b35dba427d5";
 private static String verified;
 static synchronized void invalidate(){verified=null;}
 static synchronized String verify(Context ctx)throws Exception {
  if(verified!=null)return verified;JSONObject manifest;
  try(InputStream in=AssetRepository.open(ctx,"corpus.manifest.json")){manifest=new JSONObject(ConversationService.read(in,65536));}
  VerifiedPackStore.Pack pack=AssetRepository.current(ctx);
  String expected=pack==null?EXPECTED:pack.manifest.getString("corpus_sha256");
  if(!expected.equals(manifest.optString("corpus_sha256")) || manifest.optInt("pages")!=299)throw new IOException("Book manifest mismatch. Install the complete verified candidate.");
  MessageDigest h=MessageDigest.getInstance("SHA-256");try(InputStream in=AssetRepository.open(ctx,"corpus.jsonl")){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)h.update(b,0,n);}
  StringBuilder hex=new StringBuilder();for(byte b:h.digest())hex.append(String.format(Locale.ROOT,"%02x",b&255));
  if(!expected.equals(hex.toString()))throw new IOException("Book corpus checksum failed. Install the verified candidate.");verified=expected;return verified;
 }
}
