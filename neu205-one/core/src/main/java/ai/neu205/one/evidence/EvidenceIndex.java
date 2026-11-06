package ai.neu205.one.evidence;

import ai.neu205.one.core.MiniJson;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

/**
 * In-process implementation of neu205.evidence.v1 (docs/NEU205_EVIDENCE_API_V1.md).
 * Loads corpus.jsonl + corpus.manifest.json, verifies every digest, and fails closed.
 * Returns verbatim passages only; never generates or edits answer text.
 */
public final class EvidenceIndex {
    public static final String SCHEMA = "neu205.evidence.v1";
    /** Opt-in source-proximity ranking; never enabled by NativeBrain by default. */
    public static final String STRATEGY_ATLAS = "bm25+atlas-lexical-proximity-experimental-v1";
    public static final String STRATEGY = "bm25-v1", STRATEGY_HYBRID = "bm25+bge-small-q8-rrf-v1",
            STRATEGY_COLBERT = "colbert-mxbai-edge-17m-v1";
    /** Coverage thresholds calibrated on DEV probes (see tournament report). */
    public static final double OK_COVERAGE = 0.50, WEAK_COVERAGE = 0.20;

    public static final class CancellationToken {
        private final AtomicBoolean c = new AtomicBoolean();
        public void cancel() { c.set(true); }
        public boolean isCancelled() { return c.get(); }
    }

    public static final class Passage {
        public final String chunkId, sectionPath, verbatimText, sourceHash;
        public final int startPage, endPage;
        public final double bm25, coverage;
        Passage(Chunk c, double bm25, double coverage) {
            chunkId = c.id; sectionPath = c.section; verbatimText = c.text; sourceHash = c.hash;
            startPage = c.start; endPage = c.end; this.bm25 = bm25; this.coverage = coverage;
        }
    }

    public static final class Response {
        public final String requestId, corpusSha256, status, error;
        public String strategy = STRATEGY;
        public final double elapsedMs;
        public final List<Passage> passages;
        Response(String rid, String sha, String status, String error, double ms, List<Passage> p) {
            requestId = rid; corpusSha256 = sha; this.status = status; this.error = error; elapsedMs = ms; passages = p;
        }
        public String toJson() {
            StringBuilder b = new StringBuilder("{\"schema\":\"").append(SCHEMA).append("\",\"request_id\":").append(q(requestId))
                    .append(",\"corpus_sha256\":").append(q(corpusSha256)).append(",\"strategy\":\"").append(strategy)
                    .append("\",\"elapsed_ms\":").append(String.format(Locale.US, "%.2f", elapsedMs))
                    .append(",\"evidence_status\":").append(q(status));
            if (error != null) b.append(",\"error\":").append(q(error));
            b.append(",\"passages\":[");
            for (int i = 0; i < passages.size(); i++) {
                Passage p = passages.get(i);
                if (i > 0) b.append(',');
                b.append("{\"chunk_id\":").append(q(p.chunkId)).append(",\"book_pdf_start_page\":").append(p.startPage)
                        .append(",\"book_pdf_end_page\":").append(p.endPage).append(",\"section_path\":").append(q(p.sectionPath))
                        .append(",\"verbatim_text\":").append(q(p.verbatimText)).append(",\"source_hash\":").append(q(p.sourceHash))
                        .append(",\"retrieval_scores\":{\"fused_rank\":").append((int) p.bm25)
                        .append(",\"coverage\":").append(String.format(Locale.US, "%.4f", p.coverage)).append("}}");
            }
            return b.append("]}").toString();
        }
    }

    static final class Chunk { String id, section, text, hash; int start, end; }

    private final List<Chunk> chunks = new ArrayList<>();
    private Bm25 bm25;
    private volatile AtlasReranker experimentalAtlas;

    /**
     * Enable experimental lexical proximity ranking only for authenticated source
     * development comparisons. The mobile/native answer path deliberately does
     * NOT enable this by default. No medical claim or relationship is inferred.
     */
    public synchronized void enableExperimentalAtlas() {
        if (loadError != null) throw new IllegalStateException("verified source index required");
        if (dense != null || colbert != null)
            throw new IllegalStateException("experimental Atlas cannot override the frozen dense/ColBERT strategies");
        if (experimentalAtlas != null) return;
        List<String> originals = new ArrayList<>();
        for (Chunk c : chunks) originals.add(c.text);
        experimentalAtlas = new AtlasReranker(bm25, originals);
    }
    private String corpusSha = "";
    private String loadError;
    private DenseIndex dense;
    private DenseIndex.QueryEncoder encoder;

    /**
     * Enable the pre-registered hybrid route (BM25 + bge-small-q8, RRF). The vector file digest must
     * match the dense manifest, and the row count must match the corpus; otherwise the index fails
     * closed (INDEX_CORRUPT) instead of silently degrading.
     */
    public void attachDense(byte[] vectorsF32le, String expectedSha256, int dim, DenseIndex.QueryEncoder enc) {
        if (loadError != null) return;
        try {
            if (!sha256(vectorsF32le).equals(expectedSha256)) throw new IllegalStateException("dense vector digest mismatch");
            dense = new DenseIndex(vectorsF32le, chunks.size(), dim);
            encoder = enc;
        } catch (RuntimeException e) {
            loadError = "dense index invalid: " + e.getMessage();
            chunks.clear();
        }
    }

    private ColbertIndex colbert;
    private ColbertIndex.QueryEncoder colbertEncoder;

    /** Enable genuine ColBERT ranking (adopted by the answer-level DEV rule). Fails closed on any mismatch. */
    public void attachColbert(byte[] f16le, String expectedSha256, List<Integer> tokenCounts, ColbertIndex.QueryEncoder enc) {
        if (loadError != null) return;
        try {
            if (!sha256(f16le).equals(expectedSha256)) throw new IllegalStateException("colbert vector digest mismatch");
            if (tokenCounts.size() != chunks.size()) throw new IllegalStateException("colbert row count != corpus");
            colbert = new ColbertIndex(f16le, ColbertIndex.offsetsFromCounts(tokenCounts));
            colbertEncoder = enc;
        } catch (RuntimeException e) {
            loadError = "colbert index invalid: " + e.getMessage();
            chunks.clear();
        }
    }

    public String strategy() { return colbert != null ? STRATEGY_COLBERT : dense != null ? STRATEGY_HYBRID : experimentalAtlas != null ? STRATEGY_ATLAS : STRATEGY; }

    /** Ranked corpus rows for a query: BM25 alone, or RRF(BM25 top-50, dense top-50). */
    List<Integer> rank(String query, int keep, CancellationToken token) throws Exception {
        if (colbert != null) {
            List<Integer> out = new ArrayList<>();
            for (int r : colbert.top(colbertEncoder.encode(query), keep)) out.add(r);
            return out;
        }
        double[][] b = bm25.search(query, 50);
        int[] br = new int[b.length];
        for (int i = 0; i < b.length; i++) br[i] = (int) b[i][0];
        if (dense == null) {
            AtlasReranker atlas = experimentalAtlas;
            if (atlas != null) return atlas.rerank(query, b, keep, token);
            List<Integer> out = new ArrayList<>();
            for (int i = 0; i < Math.min(keep, br.length); i++) out.add(br[i]);
            return out;
        }
        if (token != null && token.isCancelled()) return new ArrayList<>();
        float[] q = encoder.encode(query);
        int[] dr = dense.search(q, 50);
        List<int[]> lists = new ArrayList<>();
        lists.add(br); lists.add(dr);
        return DenseIndex.rrf(lists, keep);
    }

    /** Hybrid ranking with an externally supplied query vector (parity tests). */
    List<Integer> rankWithVector(String query, float[] qv, int keep) {
        double[][] b = bm25.search(query, 50);
        int[] br = new int[b.length];
        for (int i = 0; i < b.length; i++) br[i] = (int) b[i][0];
        List<int[]> lists = new ArrayList<>();
        lists.add(br); lists.add(dense.search(qv, 50));
        return DenseIndex.rrf(lists, keep);
    }

    String chunkId(int row) { return chunks.get(row).id; }

    private static final Pattern SENT = Pattern.compile("(?<=[.;:])\\s+(?=[A-Z0-9(])");

    /**
     * Compact verbatim evidence for the Qwen prompt (port of retrieval/qwen_eval.py sentence_evidence):
     * rank sentences of the returned passages by question-term coverage + rank prior, keep within
     * budgetWords, return them in book order with their page spans. Never edits sentence text.
     */
    public static List<String[]> compactSentences(String question, List<Passage> passages, int budgetWords) {
        java.util.Set<String> q = new java.util.HashSet<>(Bm25.tokens(question));
        List<Object[]> cand = new ArrayList<>();
        for (int rank = 0; rank < passages.size(); rank++) {
            Passage p = passages.get(rank);
            String[] parts = SENT.split(p.verbatimText);
            for (int j = 0; j < parts.length; j++) {
                java.util.Set<String> t = new java.util.HashSet<>(Bm25.tokens(parts[j]));
                if (t.isEmpty()) continue;
                int hit = 0;
                for (String x : q) if (t.contains(x)) hit++;
                double sc = (double) hit / Math.max(1, q.size()) + 0.05 / (1 + rank) - 0.001 * j;
                cand.add(new Object[]{sc, rank, j, parts[j], p});
            }
        }
        cand.sort((x, y) -> Double.compare((double) y[0], (double) x[0]));
        List<Object[]> keep = new ArrayList<>();
        int words = 0;
        for (Object[] c : cand) {
            int w = ((String) c[3]).trim().split("\\s+").length;
            if (words + w > budgetWords && !keep.isEmpty()) continue;
            keep.add(c); words += w;
        }
        keep.sort((x, y) -> { int c = Integer.compare((int) x[1], (int) y[1]); return c != 0 ? c : Integer.compare((int) x[2], (int) y[2]); });
        List<String[]> out = new ArrayList<>();
        for (Object[] c : keep) {
            Passage p = (Passage) c[4];
            out.add(new String[]{String.valueOf(p.startPage), String.valueOf(p.endPage), (String) c[3]});
        }
        return out;
    }

    private EvidenceIndex() {}

    /** Never throws for bad data: a corrupt index yields INDEX_CORRUPT on every search. */
    public static EvidenceIndex load(InputStream corpusJsonl, InputStream manifestJson) {
        EvidenceIndex ix = new EvidenceIndex();
        try {
            byte[] corpus = readAll(corpusJsonl);
            @SuppressWarnings("unchecked")
            Map<String, Object> man = (Map<String, Object>) MiniJson.parse(new String(readAll(manifestJson), StandardCharsets.UTF_8));
            String want = String.valueOf(man.get("corpus_sha256"));
            String got = sha256(corpus);
            if (!got.equals(want)) throw new IllegalStateException("corpus digest mismatch (manifest " + abbrev(want) + ", file " + abbrev(got) + ")");
            Set<String> ids = new HashSet<>();
            List<String> docs = new ArrayList<>();
            for (String line : new String(corpus, StandardCharsets.UTF_8).split("\n")) {
                if (line.isEmpty()) continue;
                @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) MiniJson.parse(line);
                Chunk c = new Chunk();
                c.id = (String) m.get("chunk_id"); c.section = (String) m.get("section_path"); c.text = (String) m.get("verbatim_text");
                c.hash = (String) m.get("source_hash");
                c.start = ((Number) m.get("book_pdf_start_page")).intValue(); c.end = ((Number) m.get("book_pdf_end_page")).intValue();
                if (c.id == null || !ids.add(c.id)) throw new IllegalStateException("duplicate or missing chunk id " + c.id);
                if (c.text == null || !sha256(c.text.getBytes(StandardCharsets.UTF_8)).equals(c.hash)) throw new IllegalStateException("chunk hash mismatch " + c.id);
                if (c.start < 1 || c.end < c.start || c.end > 299) throw new IllegalStateException("bad page span " + c.id);
                ix.chunks.add(c);
                docs.add(c.section + " :: " + c.text);
            }
            if (ix.chunks.isEmpty()) throw new IllegalStateException("empty corpus");
            ix.bm25 = new Bm25(docs);
            ix.corpusSha = got;
        } catch (Exception e) {
            ix.loadError = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            ix.chunks.clear();
        }
        return ix;
    }

    public String corpusSha256() { return corpusSha; }

    /** Raw ranked chunk ids without status gating (parity tests / diagnostics). */
    List<String> rawTop(String query, int k) {
        List<String> ids = new ArrayList<>();
        for (double[] h : bm25.search(query, k)) ids.add(chunks.get((int) h[0]).id);
        return ids;
    }
    public String loadError() { return loadError; }
    public int size() { return chunks.size(); }

    private static final Pattern RID = Pattern.compile("[A-Za-z0-9._-]{1,64}");
    private static final Pattern PRONOUN = Pattern.compile("\\b(it|its|they|them|their|this|that|these|those)\\b", Pattern.CASE_INSENSITIVE);

    public Response search(Map<String, Object> req, CancellationToken token) {
        long t0 = System.nanoTime();
        String rid = req.get("request_id") instanceof String ? (String) req.get("request_id") : "";
        if (loadError != null) return new Response(rid, corpusSha, "INDEX_CORRUPT", loadError, ms(t0), new ArrayList<>());
        String err = validate(req);
        if (err != null) return new Response(rid, corpusSha, "INVALID_REQUEST", err, ms(t0), new ArrayList<>());
        if (!corpusSha.equals(req.get("corpus_sha256")))
            return new Response(rid, corpusSha, "CORPUS_MISMATCH", "request corpus digest does not match the loaded book index", ms(t0), new ArrayList<>());
        String utter = (String) req.get("utterance_text");
        int max = ((Number) req.get("max_passages")).intValue();
        long budget = ((Number) req.get("latency_budget_ms")).longValue();
        String query = utter;
        Object topics = req.get("conversation_topics");
        if (topics instanceof List && (PRONOUN.matcher(utter).find() || Bm25.tokens(utter).size() <= 2)) {
            StringBuilder q = new StringBuilder(utter);
            for (Object t : (List<?>) topics) q.append(' ').append(t);
            query = q.toString();
        }
        if (token != null && token.isCancelled()) return new Response(rid, corpusSha, "CANCELLED", null, ms(t0), new ArrayList<>());
        List<Integer> hits;
        try {
            hits = rank(query, max, token);
        } catch (Exception e) {
            return new Response(rid, corpusSha, "INDEX_CORRUPT", "query encoder failed: " + e.getClass().getSimpleName(), ms(t0), new ArrayList<>());
        }
        if (token != null && token.isCancelled()) return new Response(rid, corpusSha, "CANCELLED", null, ms(t0), new ArrayList<>());
        List<Passage> out = new ArrayList<>();
        double best = 0;
        int rank = 0;
        for (int i : hits) {
            double cov = bm25.coverage(query, i);
            best = Math.max(best, cov);
            out.add(new Passage(chunks.get(i), ++rank, cov)); // 'bm25' field carries the 1-based fused rank
        }
        double elapsed = ms(t0);
        if (elapsed > budget) return new Response(rid, corpusSha, "BUDGET_EXCEEDED", null, elapsed, out);
        String status = out.isEmpty() || best < WEAK_COVERAGE ? "NONE" : best < OK_COVERAGE ? "WEAK" : "OK";
        if (status.equals("NONE")) out.clear();
        Response resp = new Response(rid, corpusSha, status, null, elapsed, out);
        resp.strategy = strategy();
        return resp;
    }

    static String validate(Map<String, Object> r) {
        if (!SCHEMA.equals(r.get("schema"))) return "schema must be " + SCHEMA;
        Object rid = r.get("request_id");
        if (!(rid instanceof String) || !RID.matcher((String) rid).matches()) return "bad request_id";
        Object u = r.get("utterance_text");
        if (!(u instanceof String) || ((String) u).trim().isEmpty() || ((String) u).length() > 1000) return "utterance_text must be 1-1000 chars";
        Object mp = r.get("max_passages");
        if (!(mp instanceof Number) || ((Number) mp).intValue() < 1 || ((Number) mp).intValue() > 20) return "max_passages must be 1-20";
        Object lb = r.get("latency_budget_ms");
        if (!(lb instanceof Number) || ((Number) lb).longValue() < 1 || ((Number) lb).longValue() > 10000) return "latency_budget_ms must be 1-10000";
        Object t = r.get("conversation_topics");
        if (t != null) {
            if (!(t instanceof List) || ((List<?>) t).size() > 8) return "conversation_topics must be a list of <= 8";
            for (Object x : (List<?>) t) if (!(x instanceof String) || ((String) x).length() > 200) return "conversation_topics entries must be strings <= 200 chars";
        }
        if (!(r.get("corpus_sha256") instanceof String) || !((String) r.get("corpus_sha256")).matches("[0-9a-f]{64}")) return "corpus_sha256 must be 64 hex";
        return null;
    }

    private static double ms(long t0) { return (System.nanoTime() - t0) / 1e6; }
    private static String abbrev(String s) { return s.length() > 12 ? s.substring(0, 12) + "…" : s; }

    static String sha256(byte[] b) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(b);
            StringBuilder s = new StringBuilder();
            for (byte x : d) s.append(String.format("%02x", x & 0xff));
            return s.toString();
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[1 << 16];
        int r;
        while ((r = in.read(buf)) > 0) o.write(buf, 0, r);
        return o.toByteArray();
    }

    static String q(String s) {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }
}
