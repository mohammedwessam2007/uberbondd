package ai.neu205.one;

import java.nio.file.*;
import java.security.*;
import java.io.*;
import java.util.*;

/** Synthetic host-only stage probe; never loads textbook or evaluation questions. */
public final class NativeTimingProbe {
    static String hash(byte[] data)throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
    }
    static String modelHash(Path path)throws Exception {
        MessageDigest digest=MessageDigest.getInstance("SHA-256");
        try(InputStream in=Files.newInputStream(path)){byte[] b=new byte[1<<20];int n;while((n=in.read(b))!=-1)digest.update(b,0,n);}
        return HexFormat.of().formatHex(digest.digest());
    }
    static long rssKiB() {
        try { for(String line:Files.readAllLines(Path.of("/proc/self/status")))
            if(line.startsWith("VmRSS:"))return Long.parseLong(line.trim().split("\\s+")[1]);
        } catch(Exception unavailable) { }
        return -1;
    }
    static void turn(NativeQwen q,int repeats,String label,boolean cancel)throws Exception {
        String prompt="<|im_start|>system\nFollow the user's synthetic output instruction exactly.<|im_end|>\n<|im_start|>user\n"
            + "Unused padding marker. ".repeat(repeats)
            + "\nReply with exactly the sentence: Ready for the synthetic test.<|im_end|>\n<|im_start|>assistant\n<think>\n</think>\n\n";
        q.prepare();ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        long start=System.nanoTime();long[] clause={-1};StreamingUtf8 decoder=new StreamingUtf8();SpeechClauses speech=new SpeechClauses();
        String status="completed";
        try{q.answer(prompt,piece->{
            bytes.write(piece,0,piece.length);
            try{if(!speech.accept(decoder.accept(piece,false),false).isEmpty()&&clause[0]<0)clause[0]=(System.nanoTime()-start)/1000;}
            catch(Exception error){throw new IllegalStateException(error);}
            if(cancel)q.cancel();
        });if(cancel)status="cancelled";
        if(!cancel&&!speech.accept(decoder.accept(new byte[0],true),true).isEmpty()&&clause[0]<0)clause[0]=(System.nanoTime()-start)/1000;
        }catch(IOException error){status="error";}
        long[] t=q.timings();
        if(status.equals("completed")&&t[6]==0)status="no-output";
        System.out.println("{\"label\":\""+label+"\",\"status\":\""+status+"\",\"prompt_sha256\":\""+hash(prompt.getBytes(java.nio.charset.StandardCharsets.UTF_8))+"\",\"output_sha256\":\""+hash(bytes.toByteArray())+"\",\"native_timings\":"+Arrays.toString(t)+",\"first_complete_synthetic_clause_us\":"+clause[0]+",\"rss_kib\":"+rssKiB()+"}");
        if(t.length!=8||t[0]<0||t[1]<0||t[2]<0||t[4]<0||t[5]<=0)throw new AssertionError("Invalid native timing snapshot");
    }
    public static void main(String[] args)throws Exception {
        Path model=Path.of(args[0]);
        if(!modelHash(model).equals("00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4"))throw new SecurityException("Pinned model identity mismatch");
        long start=System.nanoTime();
        try(NativeQwen q=new NativeQwen(model.toString(),4)){
            System.out.println("{\"load_us\":"+(System.nanoTime()-start)/1000+",\"threads\":4,\"scope\":\"SYNTHETIC_HOST_NOT_PHONE_OR_MEDICAL_EVIDENCE\"}");
            if(args.length>1&&args[1].equals("--soak30")) {
                for(int i=0;i<30;i++)turn(q,8,"soak-"+i,false);
                return;
            }
            if(args.length>1&&args[1].equals("--cancel-prefill")) {
                Throwable[] failure={null};
                Thread worker=new Thread(()->{try{turn(q,96,"cancel-during-prefill",false);}catch(Throwable e){failure[0]=e;}});
                worker.start();long deadline=System.nanoTime()+20_000_000_000L;
                while(q.stage()!=1&&worker.isAlive()&&System.nanoTime()<deadline)Thread.sleep(5);
                boolean entered=q.stage()==1;if(entered)Thread.sleep(100);
                boolean prefill=entered&&q.stage()==1;long cancelStart=System.nanoTime();q.cancel();worker.join(10000);
                if(worker.isAlive())throw new AssertionError("Cancellation exceeded 10 seconds");
                if(failure[0]!=null)throw new AssertionError("Worker failed",failure[0]);
                System.out.println("{\"prefill_observed\":"+prefill+",\"cancel_join_us\":"+(System.nanoTime()-cancelStart)/1000+"}");
                if(!prefill)throw new AssertionError("Prefill phase was not observed");
                turn(q,8,"recovered-after-prefill-cancel",false);return;
            }
            turn(q,8,"short-first",false);turn(q,96,"long-first",false);
            turn(q,96,"long-repeat",false);turn(q,8,"short-repeat",false);
            turn(q,8,"cancel-after-first-piece",true);turn(q,8,"recovered-after-cancel",false);
        }
    }
}
