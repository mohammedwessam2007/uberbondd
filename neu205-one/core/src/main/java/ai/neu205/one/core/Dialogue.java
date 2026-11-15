package ai.neu205.one.core;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Source-grounded conversational answerer. Every spoken fact is verbatim book text
 * (formatting-only shaping) or an owner-reviewed teaching paraphrase. Bounded,
 * ephemeral context: current topic, last relation, last answer remainder.
 */
public final class Dialogue {

    public enum Kind { ANSWER, MORE, REPEAT, SIMPLER, CLARIFY, NOT_FOUND, NOT_HEARD }

    public static final class Reply {
        public final Kind kind;
        public final String speech;     // what is spoken (short)
        public final String display;    // what is shown (may be longer)
        public final String citation;   // e.g. "NEU205 book p.83 · Carotid Sheath › contents"
        public final String topic, relation;
        public String chapter = ""; // chapter of the cited unit (diagnostics/evaluation)
        Reply(Kind kind, String speech, String display, String citation, String topic, String relation) {
            this.kind = kind; this.speech = speech; this.display = display; this.citation = citation;
            this.topic = topic; this.relation = relation;
        }
        @Override public String toString() { return kind + " [" + citation + "] " + speech; }
    }

    static final int SPEECH_WORDS = 38;
    static final double MIN_TOPIC_COVERAGE = 0.6;

    private final KnowledgeBase kb;
    private KnowledgeBase.Topic ctxTopic;
    private String ctxRelation;
    private String pendingMore = "";
    private Reply last;
    private List<String> pendingClarifyOptions = new ArrayList<>();

    public Dialogue(KnowledgeBase kb) { this.kb = kb; }

    /** Forget all conversational context (Stop / new session). */
    public void reset() {
        ctxTopic = null; ctxRelation = null; pendingMore = ""; last = null; pendingClarifyOptions = new ArrayList<>();
    }

    private static final Pattern REPEAT = Pattern.compile("\\b(repeat( that| it)?|say (that|it) again|again please|one more time|come again|pardon)\\b");
    private static final Pattern SIMPLER = Pattern.compile("\\b(simpl\\w*|easier|in short|plain (english|words)|eli5|break it down|explain (that|it|this)( again)?)\\b");
    private static final Pattern MORE = Pattern.compile("^(\\W*)(more|continue|go on|keep going|and\\??|the rest|tell me more|what else|anything else|next)\\b");

    /** "which ion", "what nerve" ... : the word names the answer's type, not the subject. */
    private static final Pattern ANSWER_TYPE = Pattern.compile("\\b(which|what)\\s+(ion|ions|nerve|nerves|artery|arteries|vein|muscle|muscles|bone|lobe|nucleus|nuclei|structure|structures|type|receptor|receptors|cell|cells|tract|layer|gland|hormone|neurotransmitter|part|parts|fibres|fibers|wave|waves)\\b");

    public Reply answer(String rawQuestion) {
        String q = rawQuestion == null ? "" : rawQuestion.trim();
        String ql = q.toLowerCase(Locale.ROOT);
        String residue = stripCommands(ql);
        boolean noTopicWords = Text.topicTokens(residue).isEmpty() && Text.relation(residue) == null;

        if (REPEAT.matcher(ql).find() && noTopicWords) {
            if (last == null) return notFound("There's nothing to repeat yet. Ask me a question.");
            return new Reply(Kind.REPEAT, last.speech, last.display, last.citation, last.topic, last.relation);
        }
        if (SIMPLER.matcher(ql).find() && noTopicWords) {
            if (ctxTopic == null) return notFound("Ask me about a structure first, then I can explain it simply.");
            return simpler();
        }
        if (MORE.matcher(ql).find() && noTopicWords) return more();
        if (Text.contentTokens(q).isEmpty()) return new Reply(Kind.NOT_HEARD, "", "", "", null, null);

        String rel = Text.relation(q);
        List<String> topicToks = Text.topicTokens(q);
        java.util.regex.Matcher at = ANSWER_TYPE.matcher(ql);
        if (at.find() && topicToks.size() > 1) topicToks.remove(Text.stem(at.group(2)));
        // A bare relation word answers a pending clarification ("relations", "the contents").
        if (rel == null && topicToks.size() <= 2 && !pendingClarifyOptions.isEmpty()) {
            for (String opt : pendingClarifyOptions) {
                if (ql.contains(opt) || ql.contains(Text.relationLabel(opt)) || ql.contains(Text.stem(opt))) {
                    rel = opt; topicToks = new ArrayList<>(); break;
                }
            }
        }
        boolean definitional = rel == null;
        String r = rel == null ? "definition" : rel;

        // Tier 0: pronoun / no topic words -> conversational context.
        if (topicToks.isEmpty() || (Text.hasPronoun(q) && ctxTopic != null && !strongTopicMatch(topicToks))) {
            if (ctxTopic == null) return notFound("Which structure do you mean?");
            List<String> extra = new ArrayList<>();
            for (String t : topicToks) if (!ctxTopic.nameTokens.contains(t)) extra.add(t);
            if (extra.isEmpty()) return fromTopic(ctxTopic, r, definitional);
            Reply sr = sentenceAnswer(merge(ctxTopic.nameTokens, extra), rel, ctxTopic);
            if (sr != null) return sr;
            return fromTopic(ctxTopic, r, definitional);
        }
        // Tier 1: question names a topic heading completely.
        Scored s = bestTopic(topicToks, r);
        if (s != null && s.fullQuery) {
            if (s.topic.relation(r) == null) {
                KnowledgeBase.Topic alt = fullCoverageWithRelation(topicToks, r);
                if (alt != null) return fromTopic(alt, r, definitional);
            }
            return fromTopic(s.topic, r, definitional);
        }
        // Tier 2: grounded sentence search over the whole book.
        Reply sr = sentenceAnswer(topicToks, rel, ctxTopic);
        if (sr != null) return sr;
        // Tier 3: strong partial heading match -> say what is missing instead of answering off-target.
        if (s != null && s.score >= MIN_TOPIC_COVERAGE) {
            List<String> missing = new ArrayList<>();
            for (String t : topicToks) if (!s.topic.nameTokens.contains(t) && kb.textIdf(t) >= 2.0) missing.add(t);
            if (missing.isEmpty()) return fromTopic(s.topic, r, definitional);
            List<String> have = s.topic.relations();
            return clarifyOptions(s.topic, have, "I found the " + s.topic.name.toLowerCase(Locale.ROOT)
                    + ", but your book doesn't say that about it directly. I can give its " + joinLabels(have) + ".");
        }
        pendingClarifyOptions = new ArrayList<>();
        return notFound("I couldn't find that in your NEU205 book.");
    }

    /** A topic whose heading contains every question word AND prints the relation (e.g. "Facial Nerve (VII)"). */
    private KnowledgeBase.Topic fullCoverageWithRelation(List<String> qtoks, String rel) {
        KnowledgeBase.Topic best = null;
        int bestLen = Integer.MAX_VALUE;
        for (KnowledgeBase.Topic tp : kb.topics) {
            if (tp.relation(rel) == null) continue;
            if (!tp.nameTokens.containsAll(qtoks)) continue;
            if (tp.nameTokens.size() < bestLen) { best = tp; bestLen = tp.nameTokens.size(); }
        }
        return best;
    }

    private boolean strongTopicMatch(List<String> toks) {
        Scored s = bestTopic(toks, "definition");
        return s != null && s.fullQuery;
    }

    private static List<String> merge(List<String> a, List<String> b) {
        List<String> m = new ArrayList<>(a);
        for (String x : b) if (!m.contains(x)) m.add(x);
        return m;
    }

    private Reply notFound(String msg) { return new Reply(Kind.NOT_FOUND, msg, msg, "", null, null); }

    private Reply more() {
        if (!pendingMore.isEmpty()) {
            String[] parts = Text.splitForSpeech(pendingMore, SPEECH_WORDS);
            pendingMore = parts[1];
            String speech = parts[0] + (pendingMore.isEmpty() ? "" : " Say more for the rest.");
            return remember(new Reply(Kind.MORE, speech, parts[0], last == null ? "" : last.citation,
                    ctxTopic == null ? null : ctxTopic.name, ctxRelation));
        }
        if (ctxTopic != null) {
            List<String> other = ctxTopic.relations();
            other.remove(ctxRelation);
            if (!other.isEmpty()) return clarifyOptions(ctxTopic, other,
                    "That's all on that point. For " + ctxTopic.name + ", I can also give its " + joinLabels(other) + ".");
        }
        return notFound("That's everything I have on that.");
    }

    private Reply fromTopic(KnowledgeBase.Topic topic, String rel, boolean definitional) {
        KnowledgeBase.Unit unit = topic.relation(rel);
        if (unit == null && rel.equals("action")) unit = topic.relation("function");
        if (unit == null && rel.equals("function")) unit = topic.relation("action");
        if (unit == null && definitional) unit = topic.units.get(0);
        if (unit == null) {
            // The relation may be stated inside the topic's own text without a printed label.
            Reply inside = sentenceAnswer(topic.nameTokens, rel, topic, topic);
            if (inside != null) return inside;
            List<String> have = topic.relations();
            String msg = "Your book doesn't list " + Text.relationLabel(rel) + " for the " + topic.name.toLowerCase(Locale.ROOT)
                    + ". It gives its " + joinLabels(have) + ". Which one?";
            return clarifyOptions(topic, have, msg);
        }
        ctxTopic = topic;
        ctxRelation = unit.relation;
        pendingClarifyOptions = new ArrayList<>();
        String spoken = Text.speakable(unit.text);
        String[] parts = Text.splitForSpeech(spoken, SPEECH_WORDS);
        pendingMore = parts[1];
        String lead = unit.relation.equals("definition") ? topic.name + ": "
                : capital(Text.relationLabel(unit.relation)) + " of the " + topic.name.toLowerCase(Locale.ROOT) + ": ";
        String speech = lead + parts[0] + (pendingMore.isEmpty() ? "" : " Say more for the rest.");
        Reply out = new Reply(Kind.ANSWER, speech, spoken, cite(unit), topic.name, unit.relation);
        out.chapter = unit.chapter;
        return remember(out);
    }

    private Reply sentenceAnswer(List<String> qtoks, String rel, KnowledgeBase.Topic prefer) {
        return sentenceAnswer(qtoks, rel, prefer, null);
    }

    static final double SENTENCE_MIN_COVERAGE = 0.8;

    /** Best single book sentence containing (IDF-weighted) >= 80% of the question's topic words. */
    private Reply sentenceAnswer(List<String> qtoks, String rel, KnowledgeBase.Topic prefer, KnowledgeBase.Topic only) {
        if (qtoks.isEmpty()) return null;
        if (only != null && (rel == null || !Text.REL_CUES.containsKey(rel))) return null;
        double total = 0;
        for (String t : qtoks) total += kb.textIdf(t);
        String[] cues = rel == null ? null : Text.REL_CUES.get(rel);
        KnowledgeBase.Sentence best = null;
        double bestScore = 0;
        for (KnowledgeBase.Sentence sen : kb.sentences) {
            KnowledgeBase.Topic tp = kb.topicOfUnit.get(sen.unit.id);
            if (only != null && tp != only) continue;
            double hit = 0;
            Set<String> nameToks = tp == null ? new HashSet<>() : new HashSet<>(tp.nameTokens);
            for (String t : qtoks) if (sen.toks.contains(t) || nameToks.contains(t)) hit += kb.textIdf(t);
            double cov = hit / total;
            if (cov < SENTENCE_MIN_COVERAGE) continue;
            if (only == null && !aboutSubject(sen, qtoks, nameToks)) continue; // guard against incidental mentions
            double score = cov;
            if (cues != null) {
                boolean cued = cued(sen, cues);
                if (!cued && !sen.unit.relation.equals(rel)) continue; // must actually state the relation
                if (cued) score += 0.3;
            } else if (rel != null && sen.unit.relation.equals(rel)) {
                score += 0.2;
            }
            if (rel != null && sen.unit.relation.equals(rel)) score += 0.1;
            if (tp != null && tp == prefer) score += 0.05;
            List<String> lead = Text.contentTokens(sen.text);
            if (lead.size() > qtoks.size() + 1) lead = lead.subList(0, qtoks.size() + 1);
            int inLead = 0;
            for (String t : qtoks) if (lead.contains(t)) inLead++;
            score += 0.5 * inLead / qtoks.size(); // sentence opens with the asked noun phrase
            score -= Math.min(0.1, sen.text.length() / 4000.0); // prefer focused sentences
            if (score > bestScore) { bestScore = score; best = sen; }
        }
        if (best == null) return null;
        if (cues != null && !cued(best, cues)) {
            // A relation was asked but the best sentence does not state it: never answer with it.
            return null;
        }
        KnowledgeBase.Topic tp = kb.topicOfUnit.get(best.unit.id);
        if (tp != null && rel != null && best.unit.relation.equals(rel) && tp.relation(rel) == best.unit) {
            return fromTopic(tp, rel, false); // the hit sits inside a labelled unit: give the whole unit
        }
        ctxTopic = tp;
        ctxRelation = best.unit.relation;
        pendingClarifyOptions = new ArrayList<>();
        String spoken = Text.speakable(best.text);
        String[] parts = Text.splitForSpeech(spoken, SPEECH_WORDS);
        pendingMore = parts[1];
        String speech = parts[0] + (pendingMore.isEmpty() ? "" : " Say more for the rest.");
        Reply out = new Reply(Kind.ANSWER, speech, spoken, cite(best.unit), tp == null ? null : tp.name, best.unit.relation);
        out.chapter = best.unit.chapter;
        return remember(out);
    }

    private Reply simpler() {
        KnowledgeBase.Teaching t = kb.teachingFor(ctxTopic, ctxRelation == null ? "definition" : ctxRelation);
        KnowledgeBase.Unit u = ctxTopic.relation(ctxRelation == null ? "definition" : ctxRelation);
        if (u == null) u = ctxTopic.units.get(0);
        String speech;
        if (t != null && !t.explanation.isEmpty()) {
            speech = t.explanation; // owner-reviewed paraphrase (v0.2 overlay)
        } else {
            // No reviewed paraphrase: shortest faithful form = first sentence of the book text.
            String first = Text.splitForSpeech(Text.speakable(u.text), 18)[0];
            speech = "In short, from your book: " + first;
        }
        return remember(new Reply(Kind.SIMPLER, speech, speech, cite(u), ctxTopic.name, ctxRelation));
    }

    private static boolean cued(KnowledgeBase.Sentence sen, String[] cues) {
        String low = " " + sen.text.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9 ]", " ") + " ";
        for (String c : cues) if (low.contains(" " + c + " ")) return true;
        return false;
    }

    /**
     * The sentence must be ABOUT the asked structure: either its section heading names
     * the structure, or every distinctive question word occurs in the sentence's first
     * five content words (subject position). Prevents answering "digastric nerve supply"
     * with a scalp-artery sentence that merely passes the digastric.
     */
    private boolean aboutSubject(KnowledgeBase.Sentence sen, List<String> qtoks, Set<String> nameToks) {
        List<String> head = Text.contentTokens(sen.text);
        if (head.size() > 5) head = head.subList(0, 5);
        // Subject = the most distinctive (highest-IDF) question word.
        List<String> byIdf = new ArrayList<>(qtoks);
        byIdf.sort((a, b) -> Double.compare(kb.textIdf(b), kb.textIdf(a)));
        List<String> top = byIdf.subList(0, Math.min(2, byIdf.size()));
        String subject = null;
        if (!top.isEmpty()) subject = top.get(0);
        return subject == null || head.contains(subject) || nameToks.contains(subject);
    }

    private Reply clarifyOptions(KnowledgeBase.Topic t, List<String> options, String msg) {
        pendingClarifyOptions = new ArrayList<>(options);
        ctxTopic = t;
        Reply r = new Reply(Kind.CLARIFY, msg, msg, "", t.name, null);
        last = r;
        return r;
    }

    private Reply remember(Reply r) { last = r; return r; }

    private static String stripCommands(String ql) {
        return ql.replaceAll("\\b(repeat|again|that|it|its|this|say|please|simply|simpler|simple|explain|easier|in short|plain|english|words|break|down|more|one|time|can|you|could|me|to|for|the|a|continue|go on|keep going|rest|tell|what|else|anything|next|and|ok|okay)\\b", " ");
    }

    private static boolean allInTopic(List<String> toks, KnowledgeBase.Topic t) {
        Set<String> names = new HashSet<>(t.nameTokens);
        for (String x : toks) if (!names.contains(x)) return false;
        return true;
    }

    static final class Scored { KnowledgeBase.Topic topic; double score; boolean fullQuery; }

    /**
     * Topic score = IDF-weighted fraction of the question's topic words found in the
     * topic name, averaged with the fraction of the topic name the question covers.
     * Ties prefer topics that actually print the requested relation, then the context topic.
     */
    Scored bestTopic(List<String> qtoks, String rel) {
        Scored best = null;
        double qW = 0;
        for (String t : qtoks) qW += kb.topicIdf(t);
        for (KnowledgeBase.Topic tp : kb.topics) {
            if (tp.nameTokens.isEmpty()) continue;
            Set<String> name = new HashSet<>(tp.nameTokens);
            double hit = 0; int nameHit = 0;
            for (String t : qtoks) if (name.contains(t)) hit += kb.topicIdf(t);
            if (hit == 0) continue;
            for (String n : name) if (qtoks.contains(n) || Text.REL_WORDS.contains(n)) nameHit++;
            double qCov = hit / qW;
            double nCov = nameHit / (double) name.size();
            double score = 0.65 * qCov + 0.35 * nCov;
            if (tp.relation(rel) != null) score += 0.04;
            if (tp == ctxTopic) score += 0.02;
            if (best == null || score > best.score) {
                best = new Scored(); best.topic = tp; best.score = score;
                best.fullQuery = Math.abs(hit - qW) < 1e-9 && nCov >= 0.5;
            }
        }
        if (best != null) best.score = Math.min(best.score, 1.0);
        return best;
    }

    private static String cite(KnowledgeBase.Unit u) {
        return "NEU205 book p." + u.page + " · " + u.topic + " › " + Text.relationLabel(u.relation);
    }

    private static String joinLabels(List<String> rels) {
        List<String> l = new ArrayList<>();
        for (String r : rels) l.add(Text.relationLabel(r));
        if (l.size() <= 1) return String.join("", l);
        return String.join(", ", l.subList(0, l.size() - 1)) + " and " + l.get(l.size() - 1);
    }

    private static String capital(String s) { return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1); }
}
