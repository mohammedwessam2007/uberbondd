package ai.neu205.one.evidence;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Exact Java port of retrieval/bm25.py (tokeniser, stemmer, BM25). Parity is tested against Python. */
public final class Bm25 {
    static final Set<String> STOP = new HashSet<>(Arrays.asList((
            "a an the is are was were be been being and or of in on for from to by with at into about as that this these "
            + "those it its what which who whom whose how why where when does do did can could should would may might there here tell me "
            + "please describe explain define give list name main you your i my we our s also then than so such any all").split(" ")));
    private static final Pattern ION = Pattern.compile("\\b(K|Na|Ca|Cl|Mg|H|Fe|Zn)(?:\\d?\\+{1,2}|-)(?=\\W|$)");
    private static final Pattern TOK = Pattern.compile("[a-z0-9]+");
    private static final String[][] SUFFIX = {
            {"ational", "ate", "8"}, {"ization", "ize", "8"}, {"iveness", "ive", "8"}, {"fulness", "ful", "8"},
            {"ousness", "ous", "8"}, {"ies", "y", "5"}, {"ied", "y", "5"}, {"sses", "ss", "5"}, {"ing", "", "6"},
            {"edly", "", "7"}, {"ed", "", "5"}, {"ly", "", "5"}, {"es", "", "5"}, {"s", "", "4"}};

    static final java.util.Map<String, String> LEMMA = new java.util.HashMap<>();
    static {
        String[] kv = ("contain=content contains=content contained=content containing=content contents=content "
                + "innervation=innervate innervated=innervate innervates=innervate innervating=innervate "
                + "originate=origin originates=origin arise=origin arises=origin arising=origin arose=origin "
                + "inserted=insertion inserts=insertion insert=insertion drains=drainage drain=drainage drained=drainage "
                + "draining=drainage located=site location=site situated=site lies=lie lying=lie functions=function "
                + "functional=function supplies=supply supplied=supply branches=branch branching=branch "
                + "terminates=termination terminate=termination ends=termination").split(" ");
        for (String x : kv) { String[] p = x.split("="); LEMMA.put(p[0], p[1]); }
    }

    public static String stem(String w) {
        String l = LEMMA.get(w);
        if (l != null) return l;
        if (w.length() <= 3) return w;
        for (String[] s : SUFFIX) {
            String suf = s[0];
            if (w.endsWith(suf) && w.length() >= Integer.parseInt(s[2])
                    && !(suf.equals("s") && (w.endsWith("ss") || w.endsWith("us") || w.endsWith("is")))
                    && !(suf.equals("ed") && w.endsWith("eed"))) {
                return w.substring(0, w.length() - suf.length()) + s[1];
            }
        }
        return w;
    }

    public static List<String> tokens(String text) {
        Matcher m = ION.matcher(text);
        StringBuffer sb = new StringBuffer();
        while (m.find()) m.appendReplacement(sb, " " + m.group(1).toLowerCase(Locale.ROOT) + "ion ");
        m.appendTail(sb);
        String t = sb.toString().toLowerCase(Locale.ROOT).replace('-', ' ');
        List<String> out = new ArrayList<>();
        Matcher w = TOK.matcher(t);
        while (w.find()) {
            String x = w.group();
            if (STOP.contains(x) || x.length() < 2) continue;
            out.add(stem(x));
        }
        return out;
    }

    private final double k1 = 1.2, b = 0.75;
    private final int n;
    private final double avg;
    private final int[] len;
    private final List<Map<String, Integer>> tf = new ArrayList<>();
    private final Map<String, int[]> post = new HashMap<>();
    private final Map<String, Integer> df = new HashMap<>();

    public Bm25(List<String> docs) {
        n = docs.size();
        len = new int[n];
        Map<String, List<Integer>> p = new HashMap<>();
        long total = 0;
        for (int i = 0; i < n; i++) {
            List<String> d = tokens(docs.get(i));
            len[i] = d.size();
            total += d.size();
            Map<String, Integer> f = new HashMap<>();
            for (String x : d) f.merge(x, 1, Integer::sum);
            tf.add(f);
            for (String x : f.keySet()) { df.merge(x, 1, Integer::sum); p.computeIfAbsent(x, k -> new ArrayList<>()).add(i); }
        }
        avg = n == 0 ? 0 : (double) total / n;
        for (Map.Entry<String, List<Integer>> e : p.entrySet()) {
            int[] a = new int[e.getValue().size()];
            for (int i = 0; i < a.length; i++) a[i] = e.getValue().get(i);
            post.put(e.getKey(), a);
        }
    }

    public double idf(String w) {
        int d = df.getOrDefault(w, 0);
        return Math.log(1 + (n - d + 0.5) / (d + 0.5));
    }

    /** Returns [docIndex, score*1e6] pairs sorted by score desc, ties by lower index (same as Python's stable sort over insertion order is NOT guaranteed; ties broken by index). */
    public double[][] search(String query, int k) {
        Map<Integer, Double> sc = new HashMap<>();
        for (String w : new java.util.LinkedHashSet<>(tokens(query))) {
            int[] ps = post.get(w);
            if (ps == null) continue;
            double idf = idf(w);
            for (int i : ps) {
                int f = tf.get(i).get(w);
                sc.merge(i, idf * f * (k1 + 1) / (f + k1 * (1 - b + b * len[i] / avg)), Double::sum);
            }
        }
        List<Map.Entry<Integer, Double>> l = new ArrayList<>(sc.entrySet());
        l.sort((x, y) -> { int c = Double.compare(y.getValue(), x.getValue()); return c != 0 ? c : Integer.compare(x.getKey(), y.getKey()); });
        double[][] out = new double[Math.min(k, l.size())][];
        for (int i = 0; i < out.length; i++) out[i] = new double[]{l.get(i).getKey(), l.get(i).getValue()};
        return out;
    }

    /** IDF-weighted fraction of distinct query terms present in doc i. */
    public double coverage(String query, int i) {
        Set<String> q = new HashSet<>(tokens(query));
        double tot = 0, hit = 0;
        for (String w : q) { double v = idf(w); tot += v; if (tf.get(i).containsKey(w)) hit += v; }
        return tot == 0 ? 0 : hit / tot;
    }
}
