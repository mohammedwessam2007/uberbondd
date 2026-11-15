package ai.neu205.one.core.tools;

import ai.neu205.one.core.Dialogue;
import ai.neu205.one.core.KnowledgeBase;
import ai.neu205.one.core.McqSolver;
import ai.neu205.one.core.MiniJson;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ExamRunner kb.json blind_items.json out_prefix
 * Runs the actual NEU205 core on answer-free items, one fresh isolated conversation per item.
 * Writes out_prefix.stem_with_options.json (scorer format), out_prefix.forced.json (no abstention,
 * secondary metric) and out_prefix.stem_only.json (free-form spoken reply to the stem alone).
 * Never reads any key file.
 */
public final class ExamRunner {
    @SuppressWarnings("unchecked")
    public static void main(String[] a) throws Exception {
        KnowledgeBase kb = KnowledgeBase.fromJson(new String(Files.readAllBytes(Paths.get(a[0])), StandardCharsets.UTF_8));
        List<Object> items = (List<Object>) MiniJson.parse(new String(Files.readAllBytes(Paths.get(a[1])), StandardCharsets.UTF_8));
        StringBuilder mcq = new StringBuilder("[\n"), forced = new StringBuilder("[\n"), stem = new StringBuilder("[\n");
        McqSolver solver = new McqSolver(kb);
        int n = 0;
        for (Object o : items) {
            Map<String, Object> it = (Map<String, Object>) o;
            for (String k : it.keySet())
                if (k.equals("correct") || k.equals("gold") || k.equals("answer_key") || k.equals("highlighted"))
                    throw new IllegalStateException("answer leakage in solver input: " + it.get("id"));
            String id = String.valueOf(it.get("id"));
            String st = String.valueOf(it.get("stem"));
            Map<String, String> opts = new LinkedHashMap<>();
            Object ob = it.get("options");
            if (ob instanceof Map) for (Map.Entry<String, Object> e : ((Map<String, Object>) ob).entrySet()) opts.put(e.getKey().toUpperCase(), String.valueOf(e.getValue()));
            long t0 = System.nanoTime();
            McqSolver.Choice c = solver.solve(st, opts);
            long t1 = System.nanoTime();
            Dialogue.Reply r = new Dialogue(kb).answer(st);
            long t2 = System.nanoTime();
            String sep = n++ == 0 ? "" : ",\n";
            mcq.append(sep).append(obj(id, c.letter, (t1 - t0) / 1e6, c.reason, c.citation, c.evidence, c.scores.toString(), c.confidence));
            forced.append(sep).append(obj(id, c.forcedLetter, (t1 - t0) / 1e6, c.reason, c.citation, c.evidence, c.scores.toString(), c.confidence));
            stem.append(sep).append("{\"id\":").append(q(id)).append(",\"kind\":").append(q(r.kind.name()))
                    .append(",\"speech\":").append(q(r.speech)).append(",\"citation\":").append(q(r.citation))
                    .append(",\"latency_ms\":").append(String.format(java.util.Locale.US, "%.2f", (t2 - t1) / 1e6)).append("}");
        }
        write(a[2] + ".stem_with_options.json", mcq.append("\n]\n").toString());
        write(a[2] + ".forced.json", forced.append("\n]\n").toString());
        write(a[2] + ".stem_only.json", stem.append("\n]\n").toString());
        System.out.println("items=" + n);
    }

    static String obj(String id, String choice, double ms, String reason, String cite, String ev, String scores, double conf) {
        return "{\"id\":" + q(id) + ",\"choice\":" + q(choice) + ",\"latency_ms\":" + String.format(java.util.Locale.US, "%.2f", ms)
                + ",\"confidence\":" + String.format(java.util.Locale.US, "%.3f", conf) + ",\"reason\":" + q(reason)
                + ",\"citation\":" + q(cite) + ",\"evidence\":" + q(ev) + ",\"scores\":" + q(scores) + "}";
    }

    static String q(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : (s == null ? "" : s).toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    static void write(String p, String s) throws Exception {
        try (PrintWriter w = new PrintWriter(p, "UTF-8")) { w.print(s); }
    }
}
