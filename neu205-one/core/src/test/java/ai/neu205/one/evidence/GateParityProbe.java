package ai.neu205.one.evidence;
import ai.neu205.one.core.MiniJson;
import java.io.*;
import java.nio.file.*;
import java.util.*;
/** Synthetic/public or owner-private source input only. Never accepts evaluation keys. */
public final class GateParityProbe {
 @SuppressWarnings("unchecked") public static void main(String[] args) throws Exception {
  if(args[0].equals("--gate")) {
   for(int i=1;i<args.length;i++) System.out.println(EvidenceIndex.evidenceStatus(1,Double.parseDouble(args[i])));
   return;
  }
  EvidenceIndex ix=EvidenceIndex.load(new FileInputStream(args[0]),new FileInputStream(args[1]));
  if(ix.loadError()!=null)throw new IllegalStateException(ix.loadError());
  for(String line:Files.readAllLines(Paths.get(args[2]))) {
   Map<String,Object> req=(Map<String,Object>)MiniJson.parse(line);
   System.out.println(ix.search(req,null).toJson());
  }
 }
}
