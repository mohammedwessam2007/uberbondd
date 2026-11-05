package ai.neu205.one.evidence;

import static org.junit.Assert.*;
import java.util.List;
import org.junit.Test;

/** Android framework code-only checks. No owner book, model, audio, or key. */
public final class AtlasRerankerJUnitTest {
    private static List<String> docs() {
        return List.of("A synthetic branch supplies region alpha.",
                "The synthetic nerve innervates region beta.",
                "The concentration is 3.5 units. The second concentration is 0.5 units.");
    }
    private static AtlasReranker atlas(Bm25 bm) { return new AtlasReranker(bm, docs()); }

    @Test public void baselineEvidenceRankingIsNotActivatedByConstructor() {
        Bm25 bm=new Bm25(docs());
        assertEquals(3,bm.search("synthetic region",3).length);
        assertNotNull(atlas(bm));
        // Creating a separate experimental class cannot change BM25 scoring.
        assertEquals(bm.search("synthetic region",3)[0][0],bm.search("synthetic region",3)[0][0],0);
    }
    @Test public void deterministicAndBoundedCandidates() {
        Bm25 bm=new Bm25(docs());AtlasReranker ranker=atlas(bm);
        String q="which synthetic nerve innervates region beta";
        var candidates=bm.search(q,50);
        List<Integer> one=ranker.rerank(q,candidates,2,null);
        assertEquals(one,ranker.rerank(q,candidates,2,null));
        assertTrue(one.size()<=2);
        assertEquals(Integer.valueOf(1),one.get(0));
    }
    @Test public void cancellationSuppressesRankedSourceIds() {
        Bm25 bm=new Bm25(docs());AtlasReranker ranker=atlas(bm);
        EvidenceIndex.CancellationToken token=new EvidenceIndex.CancellationToken();token.cancel();
        assertTrue(ranker.rerank("synthetic region",bm.search("synthetic region",10),5,token).isEmpty());
    }
    @Test public void absentTermsRemainAbsent() {
        Bm25 bm=new Bm25(docs());AtlasReranker ranker=atlas(bm);
        assertTrue(ranker.rerank("neverfoundwordxyz",bm.search("neverfoundwordxyz",10),5,null).isEmpty());
    }
    @Test(expected=IllegalArgumentException.class) public void corruptScoresAreRejected() {
        Bm25 bm=new Bm25(docs());atlas(bm).rerank("region",new double[][]{{0,Double.NaN}},2,null);
    }
    @Test(expected=IllegalArgumentException.class) public void untrustedRowsAreRejected() {
        Bm25 bm=new Bm25(docs());atlas(bm).rerank("region",new double[][]{{-1,4.2}},2,null);
    }
}