package ai.neu205.one.evidence;

import ai.neu205.one.core.MiniJson;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** CompactParity cases.json -> prints "same/total" comparing Java compactSentences with Python output. */
public final class CompactParity {
    @SuppressWarnings("unchecked")
    public static void main(String[] a) throws Exception {
        List<Object> cases = (List<Object>) MiniJson.parse(new String(Files.readAllBytes(Paths.get(a[0])), StandardCharsets.UTF_8));
        int same = 0;
        for (Object o : cases) {
            Map<String, Object> c = (Map<String, Object>) o;
            List<EvidenceIndex.Passage> ps = new ArrayList<>();
            for (Object x : (List<Object>) c.get("chunks")) {
                Map<String, Object> m = (Map<String, Object>) x;
                EvidenceIndex.Chunk ch = new EvidenceIndex.Chunk();
                ch.id = "x"; ch.section = ""; ch.text = (String) m.get("verbatim_text"); ch.hash = "";
                ch.start = ((Number) m.get("book_pdf_start_page")).intValue(); ch.end = ((Number) m.get("book_pdf_end_page")).intValue();
                ps.add(new EvidenceIndex.Passage(ch, 0, 0));
            }
            List<String[]> got = EvidenceIndex.compactSentences((String) c.get("question"), ps, 110);
            List<Object> want = (List<Object>) c.get("expected");
            boolean ok = got.size() == want.size();
            for (int i = 0; ok && i < got.size(); i++) ok = got.get(i)[2].equals(want.get(i));
            if (ok) same++;
        }
        System.out.println("COMPACT PARITY " + same + "/" + cases.size());
    }
}
