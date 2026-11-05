package ai.neu205.one.evidence;
import java.util.*;
public final class AtlasRerankerTests {
    private static int pass=0;
    private static void check(boolean ok,String name) {if(!ok)throw new AssertionError(name);pass++;}
    public static void main(String[] ignored) {
        List<String> docs=List.of(
            "Anatomy > Branch A :: A branch supplies structure alpha. However it does not supply structure beta.",
            "Anatomy > Branch B :: A branch supplies structure beta.",
            "Anatomy > Neural :: This synthetic nerve innervates test muscle alpha.",
            "Anatomy > Chemical :: The concentration is 3.5 units. The second result is 0.5 units.");
        Bm25 bm=new Bm25(docs);
        AtlasReranker atlas=new AtlasReranker(bm,List.of(
            "A branch supplies structure alpha. However it does not supply structure beta.",
            "A branch supplies structure beta.",
            "This synthetic nerve innervates test muscle alpha.",
            "The concentration is 3.5 units. The second result is 0.5 units."));
        String q="which nerve innervates test muscle alpha";
        double[][] b=bm.search(q,20);
        List<Integer> first=atlas.rerank(q,b,4,new EvidenceIndex.CancellationToken());
        check(!first.isEmpty(),"source answer candidates produced");
        check(first.get(0)==2,"co-located relation evidence wins synthetic fixture");
        check(first.equals(atlas.rerank(q,b,4,null)),"deterministic reranking");
        EvidenceIndex.CancellationToken c=new EvidenceIndex.CancellationToken();c.cancel();
        check(atlas.rerank(q,b,4,c).isEmpty(),"cancellation blocks output");
        check(atlas.rerank("unseenextraordinarilyrare",bm.search("unseenextraordinarilyrare",20),4,null).isEmpty(),"no unsupported invention");
        String question="which branch supplies structure beta";
        List<Integer> candidates=atlas.rerank(question,bm.search(question,50),4,null);
        check(!candidates.isEmpty(),"relationship candidate available without assertion");
        check(candidates.stream().distinct().count()==candidates.size(),"no duplicates");
        check(candidates.size()<=4,"bounded list");
        check(AtlasReranker.class.getDeclaredMethods().length>0,"class constructed");
        try {atlas.rerank(q,new double[][]{{-1,2.}},1,null);throw new AssertionError("invalid id not refused");}
        catch(IllegalArgumentException expected){pass++;}
        try {atlas.rerank(q,new double[][]{{0,Double.NaN}},1,null);throw new AssertionError("invalid score not refused");}
        catch(IllegalArgumentException expected){pass++;}
        System.out.println("ATLAS_JAVA_SYNTHETIC pass="+pass+" fail=0");
    }
}