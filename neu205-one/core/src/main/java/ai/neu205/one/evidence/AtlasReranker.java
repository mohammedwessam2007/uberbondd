package ai.neu205.one.evidence;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Optional, source-only lexical proximity reranker for the verified NEU205 corpus.
 *
 * This is NOT a semantic relationship extractor, a medical graph, an answer engine,
 * a confidence score, or a clinical evidence verifier. No aliases or inferred facts
 * are added. Passage bytes and hashes remain owned by EvidenceIndex; only row
 * indexes are reordered. The baseline remains default and must be evaluated first.
 */
final class AtlasReranker {
    private static final Pattern SENTENCE = Pattern.compile("(?<=[.!?:;])\\s+(?=[A-Z0-9(])");
    private static final Map<String, String> RELATIONS;
    static {
        Map<String, String> m = new HashMap<>();
        m.put("innervate", "nerve"); m.put("nerve", "nerve");
        m.put("supply", "supply"); m.put("artery", "supply");
        m.put("vascular", "supply"); m.put("blood", "supply");
        m.put("drainage", "drainage"); m.put("vein", "drainage");
        m.put("origin", "origin"); m.put("insertion", "insertion");
        m.put("boundary", "boundary"); m.put("boundarie", "boundary");
        m.put("medial", "laterality"); m.put("lateral", "laterality");
        m.put("left", "laterality"); m.put("right", "laterality");
        m.put("anterior", "direction"); m.put("posterior", "direction");
        m.put("superior", "direction"); m.put("inferior", "direction");
        RELATIONS = Collections.unmodifiableMap(m);
    }

    private static final class Ranked {
        final int row;
        final double base,score;
        Ranked(int r,double b,double s) { row=r; base=b; score=s; }
    }
    private final Bm25 bm;
    private final List<List<List<String>>> sourceSentences = new ArrayList<>();

    AtlasReranker(Bm25 bm, List<String> verbatimChunks) {
        if (bm == null || verbatimChunks == null || verbatimChunks.isEmpty())
            throw new IllegalArgumentException("Verified source chunks required");
        this.bm=bm;
        for (String text:verbatimChunks) {
            if (text==null) throw new IllegalArgumentException("null source chunk");
            List<List<String>> sentences = new ArrayList<>();
            for (String s:SENTENCE.split(text)) sentences.add(Bm25.tokens(s));
            sourceSentences.add(sentences);
        }
    }

    List<Integer> rerank(String query, double[][] bmCandidates, int keep, EvidenceIndex.CancellationToken cancel) {
        if (query==null || keep<1 || bmCandidates==null)
            throw new IllegalArgumentException("Bad lexical rerank request");
        Set<String> queryTerms = new HashSet<>(Bm25.tokens(query));
        double total = 0;
        for (String t:queryTerms) total+=bm.idf(t);
        if (total==0) total=1;
        Set<String> queryRelations = new HashSet<>();
        for (String t:queryTerms) if(RELATIONS.containsKey(t)) queryRelations.add(RELATIONS.get(t));
        List<Ranked> ranked = new ArrayList<>();
        for (double[] candidate:bmCandidates) {
            if (cancel!=null && cancel.isCancelled()) return new ArrayList<>();
            if (candidate.length<2 || !Double.isFinite(candidate[1]))
                throw new IllegalArgumentException("Corrupt candidate score");
            int row=(int)candidate[0];
            if(row<0 || row>=sourceSentences.size() || row!=candidate[0])
                throw new IllegalArgumentException("Out-of-range candidate source id");
            double best=0,near=0,rel=0,full=0;
            Set<String> documentTerms = new HashSet<>();
            for (List<String> sent:sourceSentences.get(row)) {
                Set<String> inSentence=new HashSet<>(sent);
                documentTerms.addAll(inSentence);
                Set<String> matched=new HashSet<>(queryTerms);
                matched.retainAll(inSentence);
                double weighted=0;
                for(String term:matched) weighted+=bm.idf(term);
                double cov=weighted/total;
                best=Math.max(best,cov);
                if(matched.size()>=2) {
                    int lo=Integer.MAX_VALUE,hi=-1;
                    for(int i=0;i<sent.size();i++) if(matched.contains(sent.get(i))) {
                        lo=Math.min(lo,i);hi=Math.max(hi,i);
                    }
                    if(hi>=lo)near=Math.max(near,matched.size()/Math.sqrt(Math.max(1,hi-lo+1)));
                }
                if(!queryRelations.isEmpty()) {
                    for(String term:inSentence) if(queryRelations.contains(RELATIONS.get(term))) {
                        rel=Math.max(rel,cov);break;
                    }
                }
            }
            for (String term:queryTerms) if(documentTerms.contains(term)) full+=bm.idf(term);
            // Original BM25 magnitude stays dominant. Pure lexical diagnostics only.
            double combined=candidate[1]+1.35*best+.25*Math.min(near,3)+.20*rel+.12*(full/total);
            ranked.add(new Ranked(row,candidate[1],combined));
        }
        ranked.sort(Comparator.comparingDouble((Ranked r)->r.score).reversed()
                .thenComparing(Comparator.comparingDouble((Ranked r)->r.base).reversed())
                .thenComparingInt(r->r.row));
        List<Integer> out=new ArrayList<>();
        for(int i=0;i<Math.min(keep,ranked.size());i++)out.add(ranked.get(i).row);
        return out;
    }
}
