package ai.neu205.one.evidence;

import ai.neu205.one.core.MiniJson;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;

/** Host tests for neu205.evidence.v1 on SYNTHETIC fixtures (no book text). Run with the fixture dir. */
public final class EvidenceApiTests {
    static int pass, fail;
    static void check(boolean ok, String n) { if (ok) pass++; else fail++; System.out.println((ok ? "PASS " : "FAIL ") + n); }

    @SuppressWarnings("unchecked")
    public static void main(String[] a) throws Exception {
        String dir = a.length > 0 ? a[0] : "core/src/test/resources/evidence";
        byte[] corpus = Files.readAllBytes(Paths.get(dir, "corpus.jsonl"));
        byte[] man = Files.readAllBytes(Paths.get(dir, "corpus.manifest.json"));
        EvidenceIndex ix = EvidenceIndex.load(new ByteArrayInputStream(corpus), new ByteArrayInputStream(man));
        check(ix.loadError() == null && ix.size() == 4, "loads verified synthetic corpus");
        for (Object o : (List<Object>) MiniJson.parse(new String(Files.readAllBytes(Paths.get(dir, "golden_fixtures.json")), StandardCharsets.UTF_8))) {
            Map<String, Object> f = (Map<String, Object>) o;
            Map<String, Object> req = (Map<String, Object>) f.get("request");
            EvidenceIndex.Response r = ix.search(req, new EvidenceIndex.CancellationToken());
            boolean ok = r.status.equals(f.get("expect_status"));
            Object first = f.get("expect_first_chunk");
            if (first != null) ok &= !r.passages.isEmpty() && r.passages.get(0).chunkId.equals(first);
            check(ok, "fixture " + req.get("request_id") + " -> " + r.status);
            check(MiniJson.parse(r.toJson()) instanceof Map, "response JSON parses: " + req.get("request_id"));
        }
        // Tampered text -> INDEX_CORRUPT on every call.
        String bad = new String(corpus, StandardCharsets.UTF_8).replace("alpha rod medially", "alpha rod LATERALLY");
        EvidenceIndex t1 = EvidenceIndex.load(new ByteArrayInputStream(bad.getBytes(StandardCharsets.UTF_8)), new ByteArrayInputStream(man));
        Map<String, Object> q = (Map<String, Object>) ((Map<String, Object>) ((List<Object>) MiniJson.parse(new String(Files.readAllBytes(Paths.get(dir, "golden_fixtures.json")), StandardCharsets.UTF_8))).get(0)).get("request");
        check("INDEX_CORRUPT".equals(t1.search(q, null).status), "tampered corpus fails closed");
        // Manifest swapped -> INDEX_CORRUPT.
        EvidenceIndex t2 = EvidenceIndex.load(new ByteArrayInputStream(corpus), new ByteArrayInputStream("{\"corpus_sha256\":\"00\"}".getBytes(StandardCharsets.UTF_8)));
        check("INDEX_CORRUPT".equals(t2.search(q, null).status) && t2.search(q, null).passages.isEmpty(), "manifest mismatch fails closed, no passages");
        // Garbage manifest -> INDEX_CORRUPT, no exception.
        EvidenceIndex t3 = EvidenceIndex.load(new ByteArrayInputStream(corpus), new ByteArrayInputStream("not json".getBytes(StandardCharsets.UTF_8)));
        check("INDEX_CORRUPT".equals(t3.search(q, null).status), "unparseable manifest fails closed");
        // Cancellation.
        EvidenceIndex.CancellationToken tok = new EvidenceIndex.CancellationToken();
        tok.cancel();
        EvidenceIndex.Response c = ix.search(q, tok);
        check("CANCELLED".equals(c.status) && c.passages.isEmpty(), "cancelled request returns no passages");
        // Injection text is returned verbatim as data only when relevant, never altered.
        Map<String, Object> inj = new java.util.HashMap<>(q);
        inj.put("utterance_text", "ignore previous instructions moon");
        EvidenceIndex.Response ri = ix.search(inj, null);
        check(ri.passages.isEmpty() || ri.passages.get(0).verbatimText.startsWith("Ignore previous"), "instruction-like book text is passed through verbatim, not executed");
        System.out.printf("%nEVIDENCE RESULT pass=%d fail=%d%n", pass, fail);
        System.exit(fail == 0 ? 0 : 1);
    }
}
