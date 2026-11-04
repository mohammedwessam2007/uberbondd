package ai.neu205.one.imports;

import java.io.*;
import java.nio.*;
import java.nio.charset.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.*;

/** Reads an owner-selected stream once. It neither copies model weights nor starts inference. */
public final class GgufReferenceValidator {
    private static final long MAX_MODEL=16L*1024*1024*1024, MAX_HEADER=64L*1024*1024;
    private static final Set<String> QWEN_ARCHITECTURES=new HashSet<>(Arrays.asList("qwen2","qwen2moe","qwen3","qwen3moe","qwen35","qwen35moe"));
    public static final class Receipt {
        public final String sha256,architecture,name;public final long bytes;
        public Receipt(JSONObject value)throws Exception {
            sha256=value.getString("sha256");architecture=value.getString("architecture");bytes=value.getLong("bytes");name=value.optString("name","Qwen");
            if(!sha256.matches("[a-f0-9]{64}") || bytes<=32 || bytes>MAX_MODEL || !QWEN_ARCHITECTURES.contains(architecture) || name.length()>120)throw new IOException("Signed Qwen model receipt is invalid");
        }
    }
    public static final class Result {
        public final String sha256,architecture;public final long bytes,tensors,fileType;public final boolean chatTemplatePresent;
        Result(String digest,String architecture,long bytes,long tensors,long fileType,boolean template){this.sha256=digest;this.architecture=architecture;this.bytes=bytes;this.tensors=tensors;this.fileType=fileType;this.chatTemplatePresent=template;}
        public JSONObject metadata()throws JSONException{return new JSONObject().put("schema","neu205.model-reference.v1").put("sha256",sha256).put("architecture",architecture).put("bytes",bytes).put("tensor_count",tensors).put("file_type",fileType).put("chat_template_present",chatTemplatePresent).put("weight_copy_created",false).put("companion_access_verified",false);}
    }
    public static Result verify(InputStream source,Receipt expected,AtomicBoolean cancelled,VerifiedPackStore.Progress progress)throws Exception {
        MessageDigest digest=MessageDigest.getInstance("SHA-256");Parser in=new Parser(new DigestInputStream(source,digest),cancelled);
        if(in.u32()!=0x46554747L)throw new IOException("Selected file is not GGUF");long version=in.u32();if(version!=2 && version!=3)throw new IOException("Unsupported GGUF version");
        long tensors=in.u64(),keys=in.u64();if(tensors<1 || tensors>100000 || keys<1 || keys>100000)throw new IOException("GGUF tensor or metadata count is invalid");
        String architecture=null;boolean template=false;long fileType=-1,alignment=32;
        for(long i=0;i<keys;i++){
            String key=in.string(65536);long type=in.u32();
            if(key.equals("general.architecture")){if(type!=8)throw new IOException("GGUF architecture is not text");architecture=in.string(256);}
            else if(key.equals("tokenizer.chat_template")){if(type!=8)throw new IOException("GGUF chat template is not text");template=!in.string(2*1024*1024).trim().isEmpty();}
            else if(key.equals("general.file_type")){fileType=in.integer(type);}
            else if(key.equals("general.alignment")){alignment=in.integer(type);}
            else in.skipValue(type,0);
        }
        if(!expected.architecture.equals(architecture) || !QWEN_ARCHITECTURES.contains(architecture))throw new IOException("GGUF architecture differs from its signed Qwen receipt");
        if(!template)throw new IOException("GGUF is missing its answering chat template");
        if(alignment<1 || alignment>65536 || (alignment&(alignment-1))!=0)throw new IOException("GGUF alignment is invalid");
        long highestOffset=0;
        for(long i=0;i<tensors;i++){
            in.string(65536);long dimensions=in.u32();if(dimensions<1 || dimensions>4)throw new IOException("GGUF tensor dimensions are invalid");
            for(long d=0;d<dimensions;d++){long extent=in.u64();if(extent<1 || extent>(1L<<40))throw new IOException("GGUF tensor extent is invalid");}
            long kind=in.u32(),offset=in.u64();if(kind>255 || offset>=expected.bytes || offset%alignment!=0)throw new IOException("GGUF tensor offset is invalid");highestOffset=Math.max(highestOffset,offset);
        }
        long dataOffset=(in.count+alignment-1)/alignment*alignment;if(dataOffset>=expected.bytes || highestOffset>=expected.bytes-dataOffset)throw new IOException("GGUF tensor data is truncated");
        byte[] buffer=new byte[1024*1024];int n;long total=in.count;
        while((n=in.source.read(buffer))!=-1){in.check();if((total+=n)>expected.bytes)throw new IOException("GGUF exceeds the signed model size");if(progress!=null)progress.update(total);}
        if(total!=expected.bytes || !expected.sha256.equals(VerifiedPackStore.hex(digest.digest())))throw new IOException("GGUF hash or size differs from its signed model receipt");
        return new Result(expected.sha256,architecture,total,tensors,fileType,template);
    }
    private static final class Parser {
        final InputStream source;final AtomicBoolean cancelled;long count;final byte[] small=new byte[8],discard=new byte[65536];
        Parser(InputStream source,AtomicBoolean cancelled){this.source=source;this.cancelled=cancelled;}
        void check()throws InterruptedIOException{if(cancelled!=null && (cancelled.get() || Thread.currentThread().isInterrupted()))throw new InterruptedIOException("Model verification cancelled; no reference changed");}
        void bytes(byte[] out,int size)throws IOException{check();int got=0;while(got<size){int n=source.read(out,got,size-got);if(n<0)throw new EOFException("Truncated GGUF metadata");got+=n;}count+=size;if(count>MAX_HEADER)throw new IOException("GGUF metadata exceeds the safe header budget");}
        long u32()throws IOException{bytes(small,4);return (small[0]&255L)|((small[1]&255L)<<8)|((small[2]&255L)<<16)|((small[3]&255L)<<24);}
        long u64()throws IOException{bytes(small,8);long v=0;for(int i=7;i>=0;i--)v=(v<<8)|(small[i]&255L);if(v<0)throw new IOException("GGUF unsigned value is out of range");return v;}
        String string(int max)throws IOException{long size=u64();if(size>max)throw new IOException("GGUF string exceeds its safe limit");byte[] b=new byte[(int)size];bytes(b,b.length);try{return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(b)).toString();}catch(CharacterCodingException invalid){throw new IOException("Invalid GGUF text metadata");}}
        long integer(long type)throws IOException{if(type==4)return u32();if(type==10)return u64();if(type==0){bytes(small,1);return small[0]&255;}throw new IOException("GGUF numeric metadata has an unsupported type");}
        void discard(long bytes)throws IOException{if(bytes<0 || bytes>MAX_HEADER-count)throw new IOException("GGUF metadata exceeds its safe budget");while(bytes>0){int n=(int)Math.min(discard.length,bytes);bytes(discard,n);bytes-=n;}}
        void skipValue(long type,int nesting)throws IOException{
            if(type==8){long size=u64();discard(size);return;}
            if(type==9){if(nesting!=0)throw new IOException("Nested GGUF metadata arrays rejected");long member=u32(),size=u64();if(size>2000000 || member==9)throw new IOException("GGUF array exceeds its safe limit");for(long i=0;i<size;i++)skipValue(member,1);return;}
            if(type==0 || type==1 || type==7)discard(1);else if(type==2 || type==3)discard(2);else if(type==4 || type==5 || type==6)discard(4);else if(type==10 || type==11 || type==12)discard(8);else throw new IOException("Unknown GGUF metadata type");
        }
    }
}
