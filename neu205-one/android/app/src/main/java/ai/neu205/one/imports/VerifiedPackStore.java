package ai.neu205.one.imports;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.*;
import org.json.*;

/** Signed, size-bounded, versioned private assets. An interrupted import never replaces active assets. */
public final class VerifiedPackStore {
    public static final String PDF_SHA="c3298e8c5f7f807604be10f7376d67f05eb315dd982276263e8f6ad2e8e70940";
    public static final String CORPUS_SHA="2f7874d9aec84e85567c21bb6b2bd291a3a1ea6237d8bdabfa216628a166f5be";
    private static final long MAX_ZIP=512L*1024*1024, MAX_TOTAL=768L*1024*1024, MAX_MEMBER=320L*1024*1024;
    private static final int MAX_FILES=48;
    public interface Progress { void update(long bytes); }
    public static final class Pack {
        public final String id; public final File directory; public final JSONObject manifest;
        Pack(String id,File directory,JSONObject manifest){this.id=id;this.directory=directory;this.manifest=manifest;}
        public File file(String path){return new File(directory,path);}
    }
    private final File root;
    private final PublicKey trustedKey;
    public VerifiedPackStore(File root,PublicKey trustedKey)throws IOException {
        this.root=root;this.trustedKey=Objects.requireNonNull(trustedKey);
        if(!root.isDirectory() && !root.mkdirs())throw new IOException("Private import storage unavailable");
        if(!new File(root,"versions").isDirectory() && !new File(root,"versions").mkdirs())throw new IOException("Private import storage unavailable");
    }
    public synchronized Pack current()throws Exception {
        File pointer=new File(root,"active.json");if(!pointer.isFile())return null;
        JSONObject p=new JSONObject(new String(read(pointer,4096),StandardCharsets.UTF_8));
        String id=p.getString("id");if(!id.matches("[a-f0-9]{64}"))throw new IOException("Imported pack pointer is corrupt");
        return verifyDirectory(id,new File(new File(root,"versions"),id));
    }
    public synchronized Pack install(InputStream source,AtomicBoolean cancelled,Progress progress)throws Exception {
        String nonce=UUID.randomUUID().toString();File archive=new File(root,"incoming-"+nonce+".zip");
        File stage=new File(root,"stage-"+nonce);
        try {
            try(FileOutputStream out=new FileOutputStream(archive)){copy(source,out,MAX_ZIP,cancelled,progress);out.getFD().sync();}
            rejectUnsafeCentralDirectory(archive);
            if(!stage.mkdir())throw new IOException("Cannot stage private study pack");
            JSONObject manifest;String id;
            try(ZipFile zip=new ZipFile(archive)){
                if(zip.size()>MAX_FILES+2)throw new IOException("Study pack contains too many members");
                Set<String> names=new HashSet<>();Enumeration<? extends ZipEntry> entries=zip.entries();
                while(entries.hasMoreElements()){
                    ZipEntry entry=entries.nextElement();validatePath(entry.getName());
                    if(entry.isDirectory() || !names.add(entry.getName()))throw new IOException("Directory or duplicate ZIP member rejected");
                    if(entry.getSize()<0 || entry.getSize()>MAX_MEMBER)throw new IOException("Study pack member exceeds safe limit");
                }
                byte[] raw=read(zip,"manifest.json",65536), signature=read(zip,"manifest.sig",2048);
                verifySignature(raw,signature);manifest=parseManifest(raw);id=hex(sha256(raw));
                JSONArray files=manifest.getJSONArray("files");Set<String> expected=new HashSet<>(Arrays.asList("manifest.json","manifest.sig"));long total=0;
                for(int i=0;i<files.length();i++){
                    check(cancelled);JSONObject item=files.getJSONObject(i);String path=item.getString("path");validateAssetPath(path);
                    if(!expected.add(path))throw new IOException("Repeated manifest member");long size=item.getLong("bytes");String digest=item.getString("sha256");
                    if(size<0 || size>MAX_MEMBER || (total+=size)>MAX_TOTAL || !digest.matches("[a-f0-9]{64}"))throw new IOException("Study pack manifest limits exceeded");
                    ZipEntry entry=zip.getEntry(path);if(entry==null || entry.getSize()!=size)throw new IOException("Study pack member missing or size mismatch");
                    File destination=new File(stage,path);File parent=destination.getParentFile();if(!parent.isDirectory() && !parent.mkdirs())throw new IOException("Cannot stage study pack member");
                    MessageDigest hash=MessageDigest.getInstance("SHA-256");long copied;
                    try(InputStream in=new DigestInputStream(zip.getInputStream(entry),hash);FileOutputStream out=new FileOutputStream(destination)){copied=copy(in,out,size,cancelled,null);out.getFD().sync();}
                    if(copied!=size || !digest.equals(hex(hash.digest())))throw new IOException("Study pack member checksum mismatch");
                }
                if(!names.equals(expected))throw new IOException("Unlisted study pack member rejected");
                writeSynced(new File(stage,"manifest.json"),raw);writeSynced(new File(stage,"manifest.sig"),signature);
            }
            Pack verified=verifyDirectory(id,stage,cancelled);check(cancelled);
            File version=new File(new File(root,"versions"),id);
            if(version.exists())verifyDirectory(id,version,cancelled);else Files.move(stage.toPath(),version.toPath(),StandardCopyOption.ATOMIC_MOVE);
            check(cancelled);File previous=new File(root,"active.json");
            if(previous.isFile())atomicWrite(new File(root,"previous.json"),read(previous,4096));
            atomicWrite(previous,new JSONObject().put("schema","neu205.asset-pointer.v1").put("id",id).toString().getBytes(StandardCharsets.UTF_8));
            return new Pack(verified.id,version,verified.manifest);
        } finally {
            archive.delete();deleteTree(stage);
            // A cancelled version may remain verified but inactive; never delete a previously active version.
        }
    }
    public synchronized Pack rollback()throws Exception {
        File previous=new File(root,"previous.json");if(!previous.isFile())throw new IOException("No prior imported pack to restore");
        byte[] pointer=read(previous,4096);String id=new JSONObject(new String(pointer,StandardCharsets.UTF_8)).getString("id");
        if(!id.matches("[a-f0-9]{64}"))throw new IOException("Rollback pointer is corrupt");Pack pack=verifyDirectory(id,new File(new File(root,"versions"),id));
        byte[] active=new File(root,"active.json").isFile()?read(new File(root,"active.json"),4096):null;
        atomicWrite(new File(root,"active.json"),pointer);if(active!=null)atomicWrite(previous,active);return pack;
    }
    private Pack verifyDirectory(String id,File dir)throws Exception {return verifyDirectory(id,dir,null);}
    private Pack verifyDirectory(String id,File dir,AtomicBoolean cancelled)throws Exception {
        check(cancelled);
        byte[] raw=read(new File(dir,"manifest.json"),65536);if(!hex(sha256(raw)).equals(id))throw new IOException("Imported manifest checksum mismatch");
        verifySignature(raw,read(new File(dir,"manifest.sig"),2048));JSONObject manifest=parseManifest(raw);JSONArray files=manifest.getJSONArray("files");
        Set<String> required=new HashSet<>(Arrays.asList("corpus.jsonl","corpus.manifest.json"));boolean hasAsr=false;Set<String> paths=new HashSet<>();
        for(int i=0;i<files.length();i++){
            JSONObject item=files.getJSONObject(i);String path=item.getString("path");validateAssetPath(path);if(!paths.add(path))throw new IOException("Repeated imported member");
            File file=new File(dir,path);if(Files.isSymbolicLink(file.toPath()) || !file.isFile() || file.length()!=item.getLong("bytes"))throw new IOException("Imported member missing or truncated");
            if(!item.getString("sha256").equals(hash(file,cancelled)))throw new IOException("Imported member checksum mismatch");required.remove(path);if(path.startsWith("models/whisper/"))hasAsr=true;
        }
        if(!required.isEmpty())throw new IOException("Complete corpus is required");
        if(hasAsr && !paths.containsAll(Arrays.asList("models/whisper/encoder.onnx","models/whisper/decoder.onnx","models/whisper/tokens.txt","models/whisper/config.properties")))throw new IOException("Partial ASR asset set rejected");
        if(!CORPUS_SHA.equals(hash(new File(dir,"corpus.jsonl"),cancelled)))throw new IOException("Imported corpus differs from the approved source-derived index");
        JSONObject corpus=new JSONObject(new String(read(new File(dir,"corpus.manifest.json"),65536),StandardCharsets.UTF_8));
        if(!CORPUS_SHA.equals(corpus.optString("corpus_sha256")) || corpus.optInt("pages")!=299)throw new IOException("Imported corpus manifest is incompatible");
        if(hasAsr){
            Properties config=new Properties();try(InputStream in=new FileInputStream(new File(dir,"models/whisper/config.properties"))){config.load(in);}
            for(String name:Arrays.asList("encoder.onnx","decoder.onnx","tokens.txt"))if(!hash(new File(dir,"models/whisper/"+name),cancelled).equals(config.getProperty(name.substring(0,name.indexOf('.'))+"_sha256")))throw new IOException("ASR config digest differs from signed assets");
        }
        return new Pack(id,dir,manifest);
    }
    private JSONObject parseManifest(byte[] raw)throws Exception {
        JSONObject m=new JSONObject(new String(raw,StandardCharsets.UTF_8));
        if(!"neu205.android-pack.v1".equals(m.optString("schema")) || !PDF_SHA.equals(m.optString("book_pdf_sha256")) || !CORPUS_SHA.equals(m.optString("corpus_sha256")))throw new IOException("Study pack source identity is not approved");
        JSONArray files=m.getJSONArray("files");if(files.length()<2 || files.length()>MAX_FILES)throw new IOException("Study pack file count is invalid");return m;
    }
    private void verifySignature(byte[] raw,byte[] signed)throws Exception {
        String algorithm=trustedKey.getAlgorithm();if(!algorithm.equals("RSA") && !algorithm.equals("EC"))throw new IOException("Unsupported study pack signer");
        Signature verifier=Signature.getInstance(algorithm.equals("RSA")?"SHA256withRSA":"SHA256withECDSA");verifier.initVerify(trustedKey);verifier.update(raw);
        if(!verifier.verify(signed))throw new IOException("Study pack is not signed by this candidate's trusted signer");
    }
    private static void validateAssetPath(String path)throws IOException {
        validatePath(path);
        if(path.equals("corpus.jsonl") || path.equals("corpus.manifest.json"))return;
        if(path.matches("models/whisper/(encoder\\.onnx|decoder\\.onnx|tokens\\.txt|config\\.properties)"))return;
        if(path.matches("memory/[A-Za-z0-9_.-]+\\.(json|jsonl|sqlite)"))return;
        throw new IOException("Unexpected study pack asset path");
    }
    private static void validatePath(String path)throws IOException {
        if(path.isEmpty() || path.length()>180 || !path.matches("[A-Za-z0-9_./-]+") || path.startsWith("/") || path.endsWith("/") || Arrays.asList(path.split("/",-1)).stream().anyMatch(s->s.isEmpty() || s.equals(".") || s.equals("..")))throw new IOException("Unsafe ZIP path rejected");
    }
    private static void rejectUnsafeCentralDirectory(File file)throws IOException {
        try(RandomAccessFile in=new RandomAccessFile(file,"r")){
            long size=in.length(),start=Math.max(0,size-65557),end=-1;in.seek(start);byte[] tail=new byte[(int)(size-start)];in.readFully(tail);
            for(int i=tail.length-22;i>=0;i--)if(u32(tail,i)==0x06054b50L && i+22+u16(tail,i+20)==tail.length){end=start+i;break;}
            if(end<0)throw new IOException("Invalid ZIP directory");in.seek(end);byte[] e=new byte[22];in.readFully(e);
            int count=u16(e,10);long offset=u32(e,16);if(u16(e,4)!=0 || u16(e,6)!=0 || u16(e,8)!=count || count>MAX_FILES+2 || offset>=end || offset+u32(e,12)!=end)throw new IOException("Multipart or oversized ZIP rejected");in.seek(offset);
            Set<String> names=new HashSet<>();for(int i=0;i<count;i++){
                byte[] h=new byte[46];in.readFully(h);if(u32(h,0)!=0x02014b50L || (u16(h,8)&1)!=0)throw new IOException("Invalid or encrypted ZIP rejected");
                int mode=(int)(u32(h,38)>>>16)&0xf000;if(mode!=0 && mode!=0x8000)throw new IOException("ZIP links and non-regular members are forbidden");
                int n=u16(h,28),extra=u16(h,30),comment=u16(h,32);if(n>180 || u32(h,24)>MAX_MEMBER || u32(h,20)==0xffffffffL)throw new IOException("ZIP member limits exceeded");
                byte[] name=new byte[n];in.readFully(name);String path=new String(name,StandardCharsets.UTF_8);validatePath(path);if(!names.add(path))throw new IOException("Duplicate ZIP member rejected");in.seek(in.getFilePointer()+extra+comment);
            }
        }
    }
    private static int u16(byte[] b,int i){return (b[i]&255)|((b[i+1]&255)<<8);}
    private static long u32(byte[] b,int i){return (long)u16(b,i)|((long)u16(b,i+2)<<16);}
    private static long copy(InputStream in,OutputStream out,long max,AtomicBoolean cancelled,Progress progress)throws IOException {
        byte[] buffer=new byte[65536];long total=0;int n;while((n=in.read(buffer))!=-1){check(cancelled);if((total+=n)>max)throw new IOException("Import exceeds its declared size limit");out.write(buffer,0,n);if(progress!=null)progress.update(total);}return total;
    }
    private static void check(AtomicBoolean cancelled)throws IOException {if(cancelled!=null && (cancelled.get() || Thread.currentThread().isInterrupted()))throw new InterruptedIOException("Import cancelled; the previous verified assets remain active");}
    private static byte[] read(ZipFile zip,String name,int max)throws IOException {ZipEntry e=zip.getEntry(name);if(e==null || e.getSize()>max)throw new IOException("Signed study pack metadata is missing or oversized");try(InputStream in=zip.getInputStream(e)){return read(in,max);}}
    private static byte[] read(File file,int max)throws IOException {try(InputStream in=new FileInputStream(file)){return read(in,max);}}
    private static byte[] read(InputStream in,int max)throws IOException {ByteArrayOutputStream out=new ByteArrayOutputStream();copy(in,out,max,null,null);return out.toByteArray();}
    public static String hash(File file)throws Exception {return hash(file,null);}
    private static String hash(File file,AtomicBoolean cancelled)throws Exception {MessageDigest h=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){check(cancelled);h.update(b,0,n);}}return hex(h.digest());}
    private static byte[] sha256(byte[] bytes)throws Exception{return MessageDigest.getInstance("SHA-256").digest(bytes);}
    static String hex(byte[] hash){StringBuilder s=new StringBuilder();for(byte b:hash)s.append(String.format(Locale.ROOT,"%02x",b&255));return s.toString();}
    private static void writeSynced(File file,byte[] bytes)throws IOException {try(FileOutputStream out=new FileOutputStream(file)){out.write(bytes);out.getFD().sync();}}
    private static void atomicWrite(File file,byte[] bytes)throws IOException {File temp=new File(file.getParentFile(),file.getName()+".new");writeSynced(temp,bytes);try{Files.move(temp.toPath(),file.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}finally{temp.delete();}}
    private static void deleteTree(File path){if(path==null || !path.exists())return;File[] children=path.listFiles();if(children!=null)for(File child:children)deleteTree(child);path.delete();}
}
