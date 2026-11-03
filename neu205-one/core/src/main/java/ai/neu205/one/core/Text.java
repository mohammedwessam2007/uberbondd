package ai.neu205.one.core;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Tokenisation, light stemming, relation-intent detection and speech shaping. Deterministic. */
public final class Text {
    private Text() {}

    static final Set<String> STOP = new HashSet<>(Arrays.asList(
            "a", "an", "the", "of", "to", "in", "on", "at", "by", "for", "and", "or", "is", "are", "was", "were",
            "be", "been", "it", "its", "it's", "they", "them", "their", "this", "that", "these", "those", "what",
            "whats", "which", "who", "whom", "where", "when", "why", "how", "do", "does", "did", "can", "could",
            "you", "me", "my", "i", "please", "tell", "about", "give", "list", "name", "say", "explain", "describe",
            "define", "definition", "there", "with", "from", "into", "as", "so", "some", "any", "all", "again",
            "okay", "ok", "now", "then", "also", "and", "us", "we", "our", "will", "would", "should", "let",
            "know", "want", "like", "just", "simply", "simple", "words", "mean", "means", "meant", "called",
            "s", "one", "ones", "more", "continue", "rest", "else", "next", "go", "keep", "going", "anything", "everything", "repeat", "easier", "short", "plain", "has", "have", "had", "main", "his", "her", "he", "she", "him", "very", "much"));

    /** Query phrase -> canonical relation. Longest/most specific first. */
    static final Map<String, String> REL_PATTERNS = new LinkedHashMap<>();
    static {
        String[][] p = {
                {"\\bnerve supply\\b|\\binnervat\\w*|\\bsupplied by (which|what) nerve|\\bwhich nerve supplies", "nerve supply"},
                {"\\bblood supply\\b|\\barterial supply\\b|\\bsupplied by (which|what) arter|\\bwhich arter\\w* supplies", "blood supply"},
                {"\\bvenous drainage\\b|\\bveins? drain", "venous drainage"},
                {"\\blymph\\w* drainage\\b", "lymphatic drainage"},
                {"\\bcontents?\\b|\\bcontain\\w*|\\bwhat (is|are|passes|runs|lies) (inside|in it|within)|\\binside (of )?(it|the)", "contents"},
                {"\\bboundar\\w*|\\bborders?\\b|\\bbounded\\b|\\bwalls?\\b|\\blimits\\b", "boundaries"},
                {"\\battach\\w*", "attachments"},
                {"\\bformation\\b|\\bformed\\b|\\bmade (up )?of\\b|\\bforms? it\\b", "formation"},
                {"\\brelations?\\b|\\brelated to\\b", "relations"},
                {"\\binsertion\\b|\\binserted\\b|\\binserts?\\b", "insertion"},
                {"\\borigin\\b|\\barises?\\b|\\barising\\b|\\boriginates?\\b", "origin"},
                {"\\bactions?\\b", "action"},
                {"\\bfunctions?\\b|\\broles?\\b|\\bimportance\\b|\\bsignificance\\b|\\bwhat does (it|they|the \\w+) do\\b|\\bused for\\b", "function"},
                {"\\bcourse\\b|\\bpathway\\b", "course"},
                {"\\bbranch\\w*", "branches"},
                {"\\bterminat\\w*|\\bwhere does (it|the \\w+) end\\b", "termination"},
                {"\\btributar\\w*", "tributaries"},
                {"\\bparts\\b|\\bdivisions?\\b|\\bdivided\\b|\\bcomponents\\b|\\bsubdivisions?\\b", "parts"},
                {"\\bextent\\b|\\bextends?\\b", "extent"},
                {"\\bapplied\\b|\\bclinical\\w*|\\blesions?\\b|\\binjur\\w*|\\bdamage\\w*|\\bparalysis\\b", "applied"},
                {"\\bcauses?\\b", "causes"},
                {"\\btypes\\b|\\bkinds\\b|\\bclassif\\w*", "types"},
                {"\\bstructure\\b", "structure"},
                {"\\bfeatures\\b", "features"},
                {"\\bwhere (is|are|does|do)\\b|\\blocation\\b|\\bsite\\b|\\bposition\\b|\\blocated\\b|\\blies?\\b", "site"},
        };
        for (String[] r : p) REL_PATTERNS.put(r[0], r[1]);
    }

    /** Words that only express the relation; removed from topic tokens. */
    static final Set<String> REL_WORDS = new HashSet<>(Arrays.asList(
            "content", "contain", "inside", "within", "boundary", "border", "bounded", "wall", "limit", "attachment",
            "attach", "attached", "formation", "formed", "form", "made", "make", "relation", "related", "insertion",
            "inserted", "insert", "origin", "arise", "arising", "originate", "action", "function", "role",
            "importance", "significance", "used", "course", "pathway", "branch", "branche", "termination",
            "terminate", "end", "tributary", "part", "division", "divided", "component", "subdivision", "extent",
            "extend", "applied", "clinical", "lesion", "injury", "damage", "paralysis", "cause", "type", "kind",
            "classification", "structure", "feature", "location", "site", "position", "located", "lie",
            "supply", "drainage", "innervation", "innervate", "innervated",
            "supplied", "supplie", "pass", "passe", "run"));

    static final Map<String, String> CANON = new LinkedHashMap<>();
    static {
        String[][] c = {{"brainstem", "brain stem"}, {"sternocleidomastoid", "sternomastoid"}, {"fibers", "fibres"},
                {"fiber", "fibre"}, {"1st", "first"}, {"2nd", "second"}, {"3rd", "third"}, {"4th", "fourth"},
                {"5th", "fifth"}, {"6th", "sixth"}, {"7th", "seventh"}, {"8th", "eighth"}, {"9th", "ninth"},
                {"10th", "tenth"}, {"11th", "eleventh"}, {"12th", "twelfth"}, {"color", "colour"},
                {"esophagus", "oesophagus"}, {"lumbar", "lumber"}, {"pacinian", "paccinian"}};
        for (String[] x : c) CANON.put(x[0], x[1]);
    }

    public static List<String> tokens(String s) { return tokens(s, false); }

    private static List<String> tokens(String s, boolean dropStop) {
        String t = s.toLowerCase(Locale.ROOT).replace('\u2019', '\'').replace("-", " ").replace("/", " ");
        t = t.replaceAll("'s\\b", "").replaceAll("[^a-z0-9+ ]", " ").replace("+", " ");
        List<String> out = new ArrayList<>();
        for (String w : t.trim().split("\\s+")) {
            if (w.isEmpty()) continue;
            String cw = CANON.getOrDefault(w, w);
            for (String x : cw.split(" ")) {
                if (dropStop && (STOP.contains(x) || x.length() <= 1)) continue;
                out.add(stem(x));
            }
        }
        return out;
    }

    public static List<String> contentTokens(String s) {
        List<String> out = new ArrayList<>();
        for (String w : tokens(s, true)) if (!STOP.contains(w) && w.length() > 1) out.add(w);
        return out;
    }

    static final Map<String, String> IRREGULAR = new java.util.HashMap<>();
    static {
        String[][] ir = {{"lies", "lie"}, {"dies", "die"}, {"ties", "tie"}, {"does", "does"}, {"arises", "arise"},
                {"arose", "arise"}, {"supplies", "supply"}, {"species", "species"}, {"series", "series"},
                {"axes", "axis"}, {"nuclei", "nucleus"}, {"ganglia", "ganglion"}, {"foramina", "foramen"}};
        for (String[] x : ir) IRREGULAR.put(x[0], x[1]);
    }

    static String stem(String w) {
        String irr = IRREGULAR.get(w);
        if (irr != null) return irr;
        if (w.length() <= 3) return w;
        if (w.endsWith("ies") && w.length() > 4) return w.substring(0, w.length() - 3) + "y";
        if (w.endsWith("sses")) return w.substring(0, w.length() - 2);
        if (w.endsWith("ches") || w.endsWith("shes") || w.endsWith("xes")) return w.substring(0, w.length() - 2);
        if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is") && !w.endsWith("as"))
            return w.substring(0, w.length() - 1);
        return w;
    }

    /** Canonical relation the question asks for, or null for a general/definition question. */
    public static String relation(String q) {
        String s = " " + q.toLowerCase(Locale.ROOT).replace("-", " ") + " ";
        for (Map.Entry<String, String> e : REL_PATTERNS.entrySet()) {
            if (Pattern.compile(e.getKey()).matcher(s).find()) return e.getValue();
        }
        return null;
    }

    /** Topic-bearing tokens of a question (relation and function words removed). */
    private static final Pattern REL_PHRASES = Pattern.compile(
            "\\b(nerve supply|blood supply|arterial supply|venous drainage|lymph\\w* drainage|supplied by (which|what) (nerve|artery|arteries)|which (nerve|artery|arteries) supplies)\\b");

    public static List<String> topicTokens(String q) {
        String stripped = REL_PHRASES.matcher(q.toLowerCase(Locale.ROOT)).replaceAll(" ");
        List<String> out = new ArrayList<>();
        for (String w : contentTokens(stripped)) if (!REL_WORDS.contains(w)) out.add(w);
        return out;
    }

    /** Words in book sentences that signal each relation (used by the sentence tier). */
    static final Map<String, String[]> REL_CUES = new LinkedHashMap<>();
    static {
        REL_CUES.put("origin", new String[]{"arise", "arises", "origin", "begin", "begins", "branch"});
        REL_CUES.put("nerve supply", new String[]{"supplied", "supply", "supplies", "innervated", "innervation"});
        REL_CUES.put("blood supply", new String[]{"supplied", "supply", "supplies", "blood"});
        REL_CUES.put("contents", new String[]{"contains", "contain", "content", "contents"});
        REL_CUES.put("function", new String[]{"function", "responsible", "role", "controls", "concerned"});
        REL_CUES.put("site", new String[]{"lies", "located", "present", "situated", "site"});
        REL_CUES.put("termination", new String[]{"ends", "end", "terminates", "termination"});
        REL_CUES.put("parts", new String[]{"parts", "divided", "consists", "formed"});
        REL_CUES.put("formation", new String[]{"formed", "formation", "consists"});
    }

    public static boolean hasPronoun(String q) {
        return Pattern.compile("\\b(it|its|it's|they|them|their|this|that|these|those|he|she)\\b")
                .matcher(q.toLowerCase(Locale.ROOT)).find();
    }

    private static final Pattern NUMBERING = Pattern.compile("(^|\\s)(?:[0-9]{1,2}\\s*[-.)]|[a-hA-H]\\s*[-)]|\\([a-z0-9]\\))\\s+");

    /** Book text -> clean speakable text (no new facts; formatting only). */
    public static String speakable(String s) {
        String t = s.replace("&", " and ").replace("->", " leads to ").replace("e.g.", "for example")
                .replace("i.e.", "that is").replace("N.B.", "Note:").replace("1/3", "one third")
                .replace("2/3", "two thirds").replace("1/2", "one half").replace("1/4", "one quarter")
                .replace("<br>", "; ").replace("|", ", ");
        Matcher m = NUMBERING.matcher(t);
        t = m.replaceAll("$1");
        t = t.replaceAll("\\s+([.,;:])", "$1").replaceAll("\\s+", " ").trim();
        return t;
    }

    /** First sentences up to maxWords, ending on a sentence/list boundary. */
    public static String[] splitForSpeech(String s, int maxWords) {
        String[] sentences = s.split("(?<=[.;])\\s+");
        StringBuilder head = new StringBuilder();
        int words = 0, used = 0;
        for (String sent : sentences) {
            int w = sent.split("\\s+").length;
            if (used > 0 && words + w > maxWords) break;
            if (head.length() > 0) head.append(' ');
            head.append(sent);
            words += w;
            used++;
        }
        StringBuilder tail = new StringBuilder();
        for (int k = used; k < sentences.length; k++) {
            if (tail.length() > 0) tail.append(' ');
            tail.append(sentences[k]);
        }
        String h = head.toString();
        if (used == 1 && words > maxWords * 1.6) { // one very long sentence: cut at a comma boundary
            String[] parts = h.split("(?<=,)\\s+");
            StringBuilder hb = new StringBuilder();
            int k = 0, ww = 0;
            for (; k < parts.length; k++) {
                int w = parts[k].split("\\s+").length;
                if (k > 0 && ww + w > maxWords) break;
                if (hb.length() > 0) hb.append(' ');
                hb.append(parts[k]); ww += w;
            }
            StringBuilder tb = new StringBuilder();
            for (int j = k; j < parts.length; j++) { if (tb.length() > 0) tb.append(' '); tb.append(parts[j]); }
            if (tb.length() > 0) tail.insert(0, tb + (tail.length() > 0 ? " " : ""));
            h = hb.toString().replaceAll(",$", ".");
        }
        return new String[]{h, tail.toString().trim()};
    }

    public static String relationLabel(String rel) {
        switch (rel) {
            case "definition": return "definition";
            case "site": return "location";
            case "applied": return "applied anatomy";
            default: return rel;
        }
    }
}
