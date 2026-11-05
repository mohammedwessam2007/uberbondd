package ai.neu205.one.evidence;

import ai.neu205.one.core.MiniJson;
import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Code-only runner; reads owner-private historical DEV probes and corpus locally.
 * No question, source, quote, answer, filename or key is ever printed. Not a blind medical eval.
 */
public final class AtlasDevDiagnostics {
  @SuppressWarnings("unchecked")
  public static void main(String[] argv) throws Exception {
    if(argv.length!=3)throw new IllegalArgumentException("corpus.jsonl corpus.manifest.json historical-dev-probes.json");
    byte[] c=Files.readAllBytes(Path.of(argv[0]));byte[] m=Files.readAllBytes(Path.of(argv[1]));
    EvidenceIndex ix=EvidenceIndex.load(new ByteArrayInputStream(c),new ByteArrayInputStream(m));
    if(ix.loadError()!=null||ix.size()!=1695)throw new IllegalStateException("Verified 1695-passage source required");
    Map<String,Map<String,Object>> entries=new HashMap<>();
    for(String line:new String(c,java.nio.charset.StandardCharsets.UTF_8).split("\n")){
      if(!line.isBlank()){
        Map<String,Object> p=(Map<String,Object>)MiniJson.parse(line);
        entries.put(String.valueOf(p.get("chunk_id")),p);
      }
    }
    List<Object> probes=(List<Object>)MiniJson.parse(Files.readString(Path.of(argv[2])));
    List<Map<String,Object>> dev=new ArrayList<>();
    for(Object o:probes){
      Map<String,Object> q=(Map<String,Object>)o;
      if(!"dev".equals(q.get("split"))||!"supported".equals(q.get("kind")))continue;
      List<Object> pg=(List<Object>)q.get("pages");
      if(pg==null||pg.isEmpty())continue;
      boolean inside=true;
      for(Object t:pg)if(((Number)t).intValue()>60)inside=false;
      if(inside)dev.add(q);
    }
    if(dev.size()!=30)throw new IllegalStateException("Expected 30 historical DEV-only source probes");
    int[] base=new int[2],atlas=new int[2];
    long[] baselineNs=new long[dev.size()],atlasNs=new long[dev.size()];
    List<List<String>> baselineResults=new ArrayList<>();
    for(int j=0;j<dev.size();j++){
      String question=(String)dev.get(j).get("question");long start=System.nanoTime();
      baselineResults.add(ix.rawTop(question,5));baselineNs[j]=System.nanoTime()-start;
    }
    ix.enableExperimentalAtlas();
    if(!EvidenceIndex.STRATEGY_ATLAS.equals(ix.strategy()))throw new IllegalStateException("Opt-in strategy not active");
    for(int j=0;j<dev.size();j++){
      Map<String,Object> p=dev.get(j);
      String question=(String)p.get("question");long start=System.nanoTime();
      List<Integer> ranked=ix.rank(question,5,new EvidenceIndex.CancellationToken());atlasNs[j]=System.nanoTime()-start;
      List<String> ranks=new ArrayList<>();for(int r:ranked)ranks.add(ix.chunkId(r));
      add(base,baselineResults.get(j),p,entries);
      add(atlas,ranks,p,entries);
    }
    System.out.println("REAL_BOOK_DEV_ONLY n=30 book_chunks="+ix.size());
    System.out.println("BASELINE page_hit_at5="+base[0]+" quote_hit_at5="+base[1]);
    System.out.println("ATLAS page_hit_at5="+atlas[0]+" quote_hit_at5="+atlas[1]);
    System.out.println("LATENCY_SCOPE=JVM_DEV_RETRIEVAL_ONLY no medical inference or phone timing");
  }
  @SuppressWarnings("unchecked")
  private static void add(int[] out,List<String> ids,Map<String,Object> p,Map<String,Map<String,Object>> entries){
    Set<Integer> pages=new HashSet<>();for(Object x:(List<Object>)p.get("pages"))pages.add(((Number)x).intValue());
    String quote=String.valueOf(p.get("source_quote")).trim().toLowerCase(java.util.Locale.ROOT);
    boolean page=false,source=false;
    for(String id:ids){
      Map<String,Object> r=entries.get(id);if(r==null)throw new IllegalStateException("unknown source row");
      int start=((Number)r.get("book_pdf_start_page")).intValue(),end=((Number)r.get("book_pdf_end_page")).intValue();
      for(int i=start;i<=end;i++)if(pages.contains(i))page=true;
      if(!quote.isBlank() && String.valueOf(r.get("verbatim_text")).toLowerCase(java.util.Locale.ROOT).contains(quote))source=true;
    }
    out[0]+=page?1:0;out[1]+=source?1:0;
  }
}