package ai.neu205.one;

import ai.neu205.one.evidence.EvidenceIndex;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** Opt-in real inference with a synthetic passage. NOT a private-book accuracy test. */
@RunWith(RobolectricTestRunner.class) @Config(sdk=35)
public class NativeBrainRealModelTest {
 @Test public void realAnswerPathRetrievesGeneratesAndRefuses()throws Exception {
  String file=System.getenv("NEU205_NATIVE_SMOKE_MODEL");
  Assume.assumeTrue("Explicit verified model and host JNI library required",file!=null && System.getenv("NEU205_HOST_JNI_DIR")!=null);
  Path model=Path.of(file);MessageDigest hash=MessageDigest.getInstance("SHA-256");
  try(InputStream in=Files.newInputStream(model)){byte[] b=new byte[4*1024*1024];int n;while((n=in.read(b))!=-1)hash.update(b,0,n);}
  assertEquals(2740937888L,Files.size(model));assertEquals("00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4",hex(hash.digest()));
  String text="The carotid body detects decreased arterial oxygen and signals respiratory centers to increase ventilation.";
  JSONObject row=new JSONObject().put("chunk_id","synthetic-plumbing-only").put("book_pdf_start_page",1).put("book_pdf_end_page",1).put("section_path","SYNTHETIC PLUMBING FIXTURE").put("verbatim_text",text).put("source_hash",hex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))));
  byte[] corpus=(row+"\n").getBytes(StandardCharsets.UTF_8);
  byte[] manifest=new JSONObject().put("corpus_sha256",hex(MessageDigest.getInstance("SHA-256").digest(corpus))).toString().getBytes(StandardCharsets.UTF_8);
  EvidenceIndex ix=EvidenceIndex.load(new ByteArrayInputStream(corpus),new ByteArrayInputStream(manifest));assertNull(ix.loadError());
  try(NativeBrain brain=new NativeBrain(new NativeQwen(model.toString(),4),ix,null)){
   for(String question:List.of("What change does the carotid body detect?","What aspirin dose should the carotid body patient take?","The carotid body detects decreased arterial oxygen and signals respiratory centers to increase ventilation. What aspirin dose?")){
    List<String> spoken=new ArrayList<>(),pages=new ArrayList<>();brain.prepare();
    brain.answer(question,new JSONArray(),new JSONArray(),new NativeBrain.Output(){public void pages(String p){pages.add(p);}public void text(String t){spoken.add(t);}});
    assertFalse(spoken.isEmpty());assertEquals(List.of(question.startsWith("What aspirin")?"[]":"[1]"),pages);
    String answer=String.join(" ",spoken);assertFalse(answer.contains("<think>"));
    System.out.println("SYNTHETIC_NATIVE_ANSWER_PATH: "+answer);
    if(question.startsWith("What change"))assertTrue(answer.toLowerCase(Locale.ROOT).contains("oxygen"));
    else assertTrue(answer.toLowerCase(Locale.ROOT).contains("evidence") || answer.toLowerCase(Locale.ROOT).contains("information"));
   }
  }
 }
 private static String hex(byte[] b){StringBuilder s=new StringBuilder();for(byte x:b)s.append(String.format(Locale.ROOT,"%02x",x&255));return s.toString();}
}
