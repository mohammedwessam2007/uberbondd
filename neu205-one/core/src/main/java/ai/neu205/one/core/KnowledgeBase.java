package ai.neu205.one.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Owner-private study pack: verbatim book units grouped by topic, with an inverted index. */
public final class KnowledgeBase {

    public static final class Unit {
        public final String id, chapter, topic, relation, text;
        public final int page;
        Unit(String id, String chapter, String topic, String relation, String text, int page) {
            this.id = id; this.chapter = chapter; this.topic = topic; this.relation = relation;
            this.text = text; this.page = page;
        }
    }

    public static final class Topic {
        public final String key, name, chapter;
        public final List<Unit> units = new ArrayList<>();
        public final List<String> nameTokens;
        Topic(String key, String name, String chapter) {
            this.key = key; this.name = name; this.chapter = chapter;
            this.nameTokens = Text.contentTokens(name);
        }
        public Unit relation(String rel) {
            for (Unit u : units) if (u.relation.equals(rel)) return u;
            return null;
        }
        public List<String> relations() {
            List<String> r = new ArrayList<>();
            for (Unit u : units) if (!r.contains(u.relation)) r.add(u.relation);
            return r;
        }
    }

    public static final class Teaching {
        public final String brief, explanation;
        Teaching(String brief, String explanation) { this.brief = brief; this.explanation = explanation; }
    }

    public static final class Sentence {
        public final Unit unit;
        public final String text;
        public final java.util.Set<String> toks;
        Sentence(Unit unit, String text) { this.unit = unit; this.text = text; this.toks = new java.util.HashSet<>(Text.contentTokens(text)); }
    }

    public final List<Topic> topics = new ArrayList<>();
    public final List<Sentence> sentences = new ArrayList<>();
    public final Map<String, Topic> topicOfUnit = new HashMap<>();
    public final Map<String, Integer> topicDf = new HashMap<>();
    public final Map<String, Integer> textDf = new HashMap<>();
    final Map<String, Teaching> teaching = new HashMap<>();
    public final String sourceSha256;
    public final int unitCount;

    @SuppressWarnings("unchecked")
    public static KnowledgeBase fromJson(String json) {
        Map<String, Object> root = (Map<String, Object>) MiniJson.parse(json);
        Map<String, Object> meta = (Map<String, Object>) root.get("meta");
        if (meta == null || !(root.get("units") instanceof List)) throw new IllegalArgumentException("not a NEU205 study pack");
        return new KnowledgeBase((List<Object>) root.get("units"), (List<Object>) root.get("teaching"),
                String.valueOf(meta.get("source_text_sha256")));
    }

    @SuppressWarnings("unchecked")
    private KnowledgeBase(List<Object> units, List<Object> teach, String sha) {
        this.sourceSha256 = sha;
        Map<String, Topic> byKey = new LinkedHashMap<>();
        int n = 0;
        for (Object o : units) {
            Map<String, Object> m = (Map<String, Object>) o;
            String topic = str(m.get("topic"));
            String chapter = str(m.get("chapter"));
            if (topic.isEmpty()) continue;
            if (str(m.get("text")).startsWith("ILOs")) continue; // learning objectives are not answers
            String key = (chapter + "|" + topic).toLowerCase();
            Topic t = byKey.get(key);
            if (t == null) { t = new Topic(key, topic, chapter); byKey.put(key, t); }
            Unit u = new Unit(str(m.get("id")), chapter, topic, str(m.get("relation")), str(m.get("text")),
                    ((Number) m.get("page")).intValue());
            t.units.add(u);
            n++;
        }
        unitCount = n;
        topics.addAll(byKey.values());
        for (Topic t : topics) {
            for (Unit u : t.units) {
                topicOfUnit.put(u.id, t);
                for (String sen : u.text.split("(?<=[.;])\\s+|\\s+(?=[0-9]{1,2}\\s*[-.]\\s)")) {
                    if (sen.trim().length() > 8) sentences.add(new Sentence(u, sen.trim()));
                }
            }
            for (String tok : new java.util.HashSet<>(t.nameTokens)) topicDf.merge(tok, 1, Integer::sum);
            java.util.Set<String> seen = new java.util.HashSet<>();
            for (Unit u : t.units) seen.addAll(Text.contentTokens(u.text));
            for (String tok : seen) textDf.merge(tok, 1, Integer::sum);
        }
        if (teach != null) {
            for (Object o : teach) {
                Map<String, Object> m = (Map<String, Object>) o;
                teaching.put(str(m.get("topic")).toLowerCase() + "|" + str(m.get("relation")).toLowerCase(),
                        new Teaching(str(m.get("brief")), str(m.get("explanation"))));
            }
        }
    }

    public Teaching teachingFor(Topic t, String relation) {
        return teaching.get(t.name.toLowerCase() + "|" + relation);
    }

    public double topicIdf(String tok) {
        int df = topicDf.getOrDefault(tok, 0);
        return Math.log(1.0 + (topics.size() + 1.0) / (df + 0.5));
    }

    public double textIdf(String tok) {
        int df = textDf.getOrDefault(tok, 0);
        return Math.log(1.0 + (topics.size() + 1.0) / (df + 0.5));
    }

    public List<Topic> topicsUnmodifiable() { return Collections.unmodifiableList(topics); }

    private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
}
