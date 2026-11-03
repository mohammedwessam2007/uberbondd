package ai.neu205.one.evidence;

import ai.neu205.one.core.MiniJson;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** BERT-uncased WordPiece tokenizer (port of retrieval/encoders.py WordPiece; ids parity-tested). */
public final class WordPiece {
    private final Map<String, Integer> vocab = new HashMap<>();
    private final int unk, cls, sep, maxLen;

    @SuppressWarnings("unchecked")
    public WordPiece(String tokenizerJson, int maxLen) {
        Map<String, Object> root = (Map<String, Object>) MiniJson.parse(tokenizerJson);
        Map<String, Object> v = (Map<String, Object>) ((Map<String, Object>) root.get("model")).get("vocab");
        for (Map.Entry<String, Object> e : v.entrySet()) vocab.put(e.getKey(), ((Number) e.getValue()).intValue());
        unk = vocab.get("[UNK]"); cls = vocab.get("[CLS]"); sep = vocab.get("[SEP]");
        this.maxLen = maxLen;
    }

    static boolean isPunct(int cp) {
        if ((cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126)) return true;
        int t = Character.getType(cp);
        return t == Character.CONNECTOR_PUNCTUATION || t == Character.DASH_PUNCTUATION || t == Character.START_PUNCTUATION
                || t == Character.END_PUNCTUATION || t == Character.INITIAL_QUOTE_PUNCTUATION || t == Character.FINAL_QUOTE_PUNCTUATION
                || t == Character.OTHER_PUNCTUATION;
    }

    static List<String> basic(String text) {
        String t = Normalizer.normalize(text.toLowerCase(java.util.Locale.ROOT), Normalizer.Form.NFD);
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        for (int i = 0; i < t.length(); ) {
            int cp = t.codePointAt(i);
            i += Character.charCount(cp);
            int type = Character.getType(cp);
            if (type == Character.NON_SPACING_MARK) continue;
            if (Character.isWhitespace(cp) || Character.isSpaceChar(cp)) {
                if (cur.length() > 0) { out.add(cur.toString()); cur.setLength(0); }
            } else if (isPunct(cp)) {
                if (cur.length() > 0) { out.add(cur.toString()); cur.setLength(0); }
                out.add(new String(Character.toChars(cp)));
            } else if (type == Character.CONTROL || type == Character.FORMAT) {
                // dropped
            } else {
                cur.appendCodePoint(cp);
            }
        }
        if (cur.length() > 0) out.add(cur.toString());
        return out;
    }

    List<Integer> piece(String w) {
        List<Integer> ids = new ArrayList<>();
        if (w.length() > 100) { ids.add(unk); return ids; }
        int start = 0;
        while (start < w.length()) {
            int end = w.length();
            Integer found = null;
            while (start < end) {
                String sub = start == 0 ? w.substring(start, end) : "##" + w.substring(start, end);
                Integer id = vocab.get(sub);
                if (id != null) { found = id; break; }
                end--;
            }
            if (found == null) { ids.clear(); ids.add(unk); return ids; }
            ids.add(found);
            start = end;
        }
        return ids;
    }

    /** [CLS] tokens [SEP], truncated to maxLen. */
    public long[] encode(String text) {
        List<Integer> a = new ArrayList<>();
        for (String w : basic(text)) a.addAll(piece(w));
        if (a.size() > maxLen - 2) a = a.subList(0, maxLen - 2);
        long[] ids = new long[a.size() + 2];
        ids[0] = cls;
        for (int i = 0; i < a.size(); i++) ids[i + 1] = a.get(i);
        ids[ids.length - 1] = sep;
        return ids;
    }
}
