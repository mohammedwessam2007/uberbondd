package ai.neu205.one.core;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Book-grounded multiple-choice adapter. General purpose: it knows nothing about any particular
 * exam. Each option is scored by the best single book passage (a sentence plus its section
 * heading) that supports BOTH the stem's distinctive words and the option's distinctive words.
 * Negative stems (EXCEPT / NOT / FALSE / LEAST) abstain: lexical absence and proximity
 * to a negator cannot establish that an option is false or excluded.
 */
public final class McqSolver {

    public static final class Choice {
        public final String letter;           // "A".."G" or "ABSTAIN"
        public final String forcedLetter;     // best option even when abstaining (secondary metric)
        public final double confidence;       // margin-based, 0..1, NOT a calibrated probability
        public final Map<String, Double> scores;
        public final String evidence, citation, reason;
        Choice(String letter, String forced, double conf, Map<String, Double> scores, String evidence, String citation, String reason) {
            this.letter = letter; this.forcedLetter = forced; this.confidence = conf; this.scores = scores;
            this.evidence = evidence; this.citation = citation; this.reason = reason;
        }
    }

    static final double MIN_SUPPORT = 0.30, MIN_MARGIN = 0.04;
    private static final Pattern NEG = Pattern.compile("\\b(except|not|false|incorrect|untrue|wrong|least|never|cannot|isn't|doesn't|does not|is not|are not)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern ALL_ABOVE = Pattern.compile("\\ball (of )?(the )?(above|these|of them)\\b|\\bboth\\b.*\\band\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern NONE_ABOVE = Pattern.compile("\\bnone (of )?(the )?(above|these|of them)\\b", Pattern.CASE_INSENSITIVE);

    /** Question-format words that say nothing about the subject matter. */
    static final Set<String> MCQ_BOILERPLATE = new HashSet<>(java.util.Arrays.asList(
            "following", "all", "except", "true", "false", "correct", "incorrect", "statement", "statements",
            "regarding", "concerning", "best", "most", "least", "likely", "choose", "select", "answer", "option",
            "options", "not", "regard", "related", "characterized", "characterised", "considered", "match", "item"));

    private final KnowledgeBase kb;

    public McqSolver(KnowledgeBase kb) { this.kb = kb; }

    public Choice solve(String stem, Map<String, String> options) {
        boolean negative = NEG.matcher(stem).find();
        List<String> stemToks = new ArrayList<>();
        for (String t : dedupe(Text.contentTokens(stem))) if (!MCQ_BOILERPLATE.contains(t)) stemToks.add(t);
        // Option words shared by every option carry no discriminating information.
        Map<String, List<String>> optToks = new LinkedHashMap<>();
        Map<String, Integer> freq = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : options.entrySet()) {
            List<String> t = dedupe(Text.contentTokens(e.getValue()));
            optToks.put(e.getKey(), t);
            for (String x : t) freq.merge(x, 1, Integer::sum);
        }
        Map<String, Double> scores = new LinkedHashMap<>();
        Map<String, String> ev = new LinkedHashMap<>(), cite = new LinkedHashMap<>();
        String allKey = null, noneKey = null;
        for (Map.Entry<String, String> e : options.entrySet()) {
            String letter = e.getKey();
            if (ALL_ABOVE.matcher(e.getValue()).find() && e.getValue().length() < 40) { allKey = letter; continue; }
            if (NONE_ABOVE.matcher(e.getValue()).find()) { noneKey = letter; continue; }
            List<String> distinct = new ArrayList<>();
            for (String x : optToks.get(letter)) if (freq.get(x) < options.size() || options.size() == 1) distinct.add(x);
            if (distinct.isEmpty()) distinct = optToks.get(letter);
            List<String> unique = new ArrayList<>();
            for (String x : optToks.get(letter)) if (freq.get(x) == 1) unique.add(x);
            if (unique.isEmpty()) unique = distinct;
            Evidence best = bestEvidence(stemToks, distinct, unique, Text.relation(stem));
            scores.put(letter, best.score);
            ev.put(letter, best.text);
            cite.put(letter, best.cite);
        }
        if (scores.isEmpty()) return abstain(scores, null, "no scorable options");

        String top = null, second = null;
        for (String k : scores.keySet()) {
            if (top == null || scores.get(k) > scores.get(top)) { second = top; top = k; }
            else if (second == null || scores.get(k) > scores.get(second)) second = k;
        }
        double s1 = scores.get(top), s2 = second == null ? 0 : scores.get(second);

        if (negative) {
            // Neither omission from the source nor a nearby negator proves exclusion.
            // Do not export a forced letter as if this lexical ranking were an answer.
            return abstain(scores, null, "negative stem requires independent exclusion verification");
        }
        if (allKey != null) {
            int supported = 0;
            for (double v : scores.values()) if (v >= MIN_SUPPORT) supported++;
            if (supported >= Math.max(2, scores.size())) return new Choice(allKey, allKey, 0.5, scores, ev.get(top), cite.get(top), "every listed option supported");
        }
        if (s1 < MIN_SUPPORT) {
            if (noneKey != null) return abstain(scores, noneKey, "no option supported ('none' not asserted)");
            return abstain(scores, top, "no option supported by the book");
        }
        if (s1 - s2 < MIN_MARGIN) return abstain(scores, top, "two options equally supported");
        double conf = Math.min(1.0, (s1 - s2) / Math.max(0.05, s1));
        return new Choice(top, top, conf, scores, ev.get(top), cite.get(top), "best-supported option");
    }

    private Choice abstain(Map<String, Double> scores, String forced, String why) {
        return new Choice("ABSTAIN", forced == null ? "ABSTAIN" : forced, 0, scores, "", "", why);
    }

    static final class Evidence { double score; boolean excluded; String text = "", cite = ""; }

    private static final Set<String> NEGATORS = new HashSet<>(java.util.Arrays.asList("except", "not", "no", "without", "never", "nor", "neither"));

    /**
     * score = coverage(stem words) * coverage(option words) * proximity, IDF-weighted, over one
     * sentence plus its section heading. If the sentence names the option right after a negator
     * ("... except external carotid artery"), it is evidence AGAINST the option (excluded).
     */
    Evidence bestEvidence(List<String> stemToks, List<String> optToks) { return bestEvidence(stemToks, optToks, optToks, null); }

    Evidence bestEvidence(List<String> stemToks, List<String> optToks, List<String> uniqueToks, String rel) {
        String subject = null;
        for (String t : stemToks) if (subject == null || kb.textIdf(t) > kb.textIdf(subject)) subject = t;
        Evidence best = new Evidence();
        double sw = 0, ow = 0;
        for (String t : stemToks) sw += kb.textIdf(t);
        for (String t : optToks) ow += kb.textIdf(t);
        if (ow == 0) return best;
        boolean anyExcluded = false;
        double exStemCov = 0, bestStemCov = 0;
        String exText = "", exCite = "";
        for (KnowledgeBase.Sentence s : kb.sentences) {
            KnowledgeBase.Topic tp = kb.topicOfUnit.get(s.unit.id);
            Set<String> name = tp == null ? new HashSet<>() : new HashSet<>(tp.nameTokens);
            double oh = 0;
            for (String t : optToks) {
                if (s.toks.contains(t)) oh += kb.textIdf(t);
                else if (name.contains(t)) oh += 0.8 * kb.textIdf(t);
            }
            if (oh == 0) continue;
            double sh = 0;
            for (String t : stemToks) if (s.toks.contains(t) || name.contains(t)) sh += kb.textIdf(t);
            double stemCov = sw == 0 ? 0.5 : sh / sw;
            if (rel != null && rel.equals(s.unit.relation)) stemCov = Math.min(1.0, stemCov + 0.25);
            double sc = stemCov * (oh / ow) * proximity(s.seq, subject, stemToks, optToks);
            if (stemCov >= 0.5 && negated(s.seq, uniqueToks)) {
                if (sc > 0.2 && stemCov > exStemCov) { anyExcluded = true; exStemCov = stemCov; exText = s.text; exCite = cite(s); }
                continue;
            }
            if (sc > best.score) { best.score = sc; bestStemCov = stemCov; best.text = s.text; best.cite = cite(s); }
        }
        if (anyExcluded && (best.score < 0.5 || exStemCov >= bestStemCov)) { best.excluded = true; best.score = 0; best.text = exText; best.cite = exCite; }
        return best;
    }

    private static String cite(KnowledgeBase.Sentence s) { return "NEU205 book p." + s.unit.page + " · " + s.unit.topic; }

    /** 1.0 when option and stem words are adjacent; decays with token distance inside the sentence. */
    static double proximity(List<String> seq, String subject, List<String> stemToks, List<String> optToks) {
        int best = Integer.MAX_VALUE;
        boolean subjectPresent = subject != null && seq.contains(subject);
        for (int i = 0; i < seq.size(); i++) {
            if (!optToks.contains(seq.get(i))) continue;
            for (int j = 0; j < seq.size(); j++) {
                boolean anchor = subjectPresent ? seq.get(j).equals(subject) : stemToks.contains(seq.get(j));
                if (anchor) best = Math.min(best, i >= j ? i - j : 3 * (j - i)); // facts usually follow their subject
            }
        }
        if (best == Integer.MAX_VALUE) return 0.75; // stem support came from the section heading
        return 0.6 + 0.4 / (1.0 + best / 6.0);
    }

    /** Option word appears within 4 tokens after a negator. */
    static boolean negated(List<String> seq, List<String> optToks) {
        for (int i = 0; i < seq.size(); i++) {
            if (!optToks.contains(seq.get(i))) continue;
            for (int k = Math.max(0, i - 4); k < i; k++) if (NEGATORS.contains(seq.get(k))) return true;
        }
        return false;
    }

    private static List<String> dedupe(List<String> in) {
        List<String> o = new ArrayList<>();
        for (String x : in) if (!o.contains(x)) o.add(x);
        return o;
    }

    public static String normalise(String s) { return s == null ? "" : s.toLowerCase(Locale.ROOT).trim(); }
}
