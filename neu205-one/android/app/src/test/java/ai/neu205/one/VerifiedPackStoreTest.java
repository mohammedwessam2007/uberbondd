package ai.neu205.one;
import ai.neu205.one.imports.*;
import java.io.*;import java.nio.file.*;import java.nio.charset.StandardCharsets;import java.security.*;import java.util.*;import java.util.concurrent.atomic.AtomicBoolean;import java.util.zip.*;import org.json.*;import org.junit.*;import org.junit.runner.RunWith;import org.robolectric.*;import org.robolectric.annotation.Config;import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class) @Config(sdk=35)
public class VerifiedPackStoreTest {
 KeyPair key;File root;byte[] corpus,corpusManifest;String approvedCorpus;String sourcePdf=VerifiedPackStore.PDF_SHA;
 @Before public void prepare()throws Exception{
  KeyPairGenerator g=KeyPairGenerator.getInstance("RSA");g.initialize(2048);key=g.generateKeyPair();root=Files.createTempDirectory("pack-test").toFile();
  corpus="synthetic security-test fixture; never medical knowledge\n".getBytes(StandardCharsets.UTF_8);
  corpusManifest=new JSONObject().put("pages",299).put("corpus_sha256",hex(MessageDigest.getInstance("SHA-256").digest(corpus))).toString().getBytes(StandardCharsets.UTF_8);
  approvedCorpus=hex(MessageDigest.getInstance("SHA-256").digest(corpus));
 }

 byte[] pack(String note,boolean tamper,String extra,KeyPair signer)throws Exception{
  LinkedHashMap<String,byte[]> members=new LinkedHashMap<>();members.put("corpus.jsonl",corpus);members.put("corpus.manifest.json",corpusManifest);JSONArray files=new JSONArray();for(var e:members.entrySet())files.put(new JSONObject().put("path",e.getKey()).put("bytes",e.getValue().length).put("sha256",hex(MessageDigest.getInstance("SHA-256").digest(e.getValue()))));
  JSONObject m=new JSONObject().put("schema","neu205.android-pack.v1").put("book_pdf_sha256",sourcePdf).put("corpus_sha256",approvedCorpus).put("files",files).put("note",note);byte[] raw=m.toString().getBytes(StandardCharsets.UTF_8);Signature sign=Signature.getInstance("SHA256withRSA");sign.initSign(signer.getPrivate());sign.update(raw);members.put("manifest.json",raw);members.put("manifest.sig",sign.sign());if(tamper){byte[] changed=corpus.clone();changed[0]^=1;members.put("corpus.jsonl",changed);}if(extra!=null)members.put(extra,new byte[]{1});
  ByteArrayOutputStream output=new ByteArrayOutputStream();try(ZipOutputStream zip=new ZipOutputStream(output)){for(var e:members.entrySet()){zip.putNextEntry(new ZipEntry(e.getKey()));zip.write(e.getValue());zip.closeEntry();}}return output.toByteArray();
 }
 static String hex(byte[] b){StringBuilder s=new StringBuilder();for(byte v:b)s.append(String.format("%02x",v&255));return s.toString();}
 VerifiedPackStore store()throws Exception{return new VerifiedPackStore(root,key.getPublic());}
 void reject(byte[] bytes,String expectedMessage)throws Exception{try{store().install(new ByteArrayInputStream(bytes),new AtomicBoolean(),null);fail("unsafe pack accepted");}catch(IOException|SignatureException expected){assertTrue("Failure must reach the intended security check",expected.getMessage().contains(expectedMessage));}}
 @Test public void signedImportAndRollbackPreserveExactCorpus()throws Exception{var s=store();var first=s.install(new ByteArrayInputStream(pack("first",false,null,key)),new AtomicBoolean(),null);var second=s.install(new ByteArrayInputStream(pack("second",false,null,key)),new AtomicBoolean(),null);assertNotEquals(first.id,second.id);assertEquals(second.id,s.current().id);assertEquals(first.id,s.rollback().id);assertEquals(approvedCorpus,VerifiedPackStore.hash(s.current().file("corpus.jsonl")));}
 @Test public void tamperLeavesPriorPointerIntact()throws Exception{var s=store();String old=s.install(new ByteArrayInputStream(pack("good",false,null,key)),new AtomicBoolean(),null).id;reject(pack("tampered",true,null,key),"checksum mismatch");assertEquals(old,s.current().id);}
 @Test public void cancellationLeavesPriorPointerIntact()throws Exception{var s=store();String old=s.install(new ByteArrayInputStream(pack("good",false,null,key)),new AtomicBoolean(),null).id;try{s.install(new ByteArrayInputStream(pack("new",false,null,key)),new AtomicBoolean(true),null);fail();}catch(InterruptedIOException expected){}assertEquals(old,s.current().id);}
 @Test public void signedCorpusManifestMismatchRejected()throws Exception{corpusManifest=new JSONObject().put("pages",299).put("corpus_sha256","0".repeat(64)).toString().getBytes(StandardCharsets.UTF_8);reject(pack("mismatch",false,null,key),"manifest is incompatible");assertNull(store().current());}
 @Test public void signedButWrongCorpusDigestRejected()throws Exception{approvedCorpus="0".repeat(64);reject(pack("mismatch",false,null,key),"signed source-derived index");assertNull(store().current());}
 @Test public void signedWrongPdfRejected()throws Exception{sourcePdf="0".repeat(64);reject(pack("wrong-source",false,null,key),"source identity is not approved");assertNull(store().current());}
 @Test public void wrongSignerRejected()throws Exception{KeyPairGenerator g=KeyPairGenerator.getInstance("RSA");g.initialize(2048);reject(pack("wrong",false,null,g.generateKeyPair()),"not signed");assertNull(store().current());}
 @Test public void unlistedMemberRejected()throws Exception{reject(pack("extra",false,"memory/extra.json",key),"Unlisted study pack member");}
 @Test public void traversalRejectedBeforeExtraction()throws Exception{reject(pack("path",false,"../escape",key),"Unsafe ZIP path");assertFalse(new File(root.getParentFile(),"escape").exists());}
 @Test public void truncatedArchiveRejected()throws Exception{byte[] p=pack("truncated",false,null,key);reject(Arrays.copyOf(p,p.length-30),"Invalid ZIP directory");}
 @Test public void modifiedInstalledCorpusFailsClosed()throws Exception{var s=store();var p=s.install(new ByteArrayInputStream(pack("good",false,null,key)),new AtomicBoolean(),null);try(RandomAccessFile f=new RandomAccessFile(p.file("corpus.jsonl"),"rw")){f.writeByte(0);}try{s.current();fail();}catch(IOException expected){}}
}
