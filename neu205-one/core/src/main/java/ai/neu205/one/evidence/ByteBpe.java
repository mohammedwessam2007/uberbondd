package ai.neu205.one.evidence;

import ai.neu205.one.core.MiniJson;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Byte-level BPE (GPT-2 style pre-tokenisation) for mxbai-edge-colbert (ModernBERT) — port of
 * retrieval/colbert.py ByteBPE, which matches the reference `tokenizers` library 350/350.
 * Lowercase + NFC, no special tokens added here.
 */
public final class ByteBpe {
    private static final Pattern PAT = Pattern.compile("'s|'t|'re|'ve|'m|'ll|'d| ?[\\p{L}]+| ?[\\p{N}]+| ?[^\\s\\p{L}\\p{N}]+|\\s+(?!\\S)|\\s+");
    private final Map<String, Integer> vocab = new HashMap<>();
    private final Map<String, Integer> ranks = new HashMap<>();
    private final Map<String, Integer> special = new HashMap<>();
    private final String[] b2u = new String[256];
    private final Map<String, int[]> cache = new HashMap<>();

    @SuppressWarnings("unchecked")
    public ByteBpe(String tokenizerJson) {
        Map<String, Object> root = (Map<String, Object>) MiniJson.parse(tokenizerJson);
        Map<String, Object> model = (Map<String, Object>) root.get("model");
        for (Map.Entry<String, Object> e : ((Map<String, Object>) model.get("vocab")).entrySet())
            vocab.put(e.getKey(), ((Number) e.getValue()).intValue());
        int r = 0;
        for (Object m : (List<Object>) model.get("merges")) {
            String key;
            if (m instanceof String) key = (String) m;
            else { List<Object> l = (List<Object>) m; key = l.get(0) + " " + l.get(1); }
            ranks.put(key, r++);
        }
        for (Object o : (List<Object>) root.get("added_tokens")) {
            Map<String, Object> a = (Map<String, Object>) o;
            special.put((String) a.get("content"), ((Number) a.get("id")).intValue());
        }
        List<Integer> bs = new ArrayList<>();
        for (int b = '!'; b <= '~'; b++) bs.add(b);
        for (int b = 0xA1; b <= 0xAC; b++) bs.add(b);
        for (int b = 0xAE; b <= 0xFF; b++) bs.add(b);
        int n = 0;
        for (int b = 0; b < 256; b++) {
            if (bs.contains(b)) b2u[b] = new String(Character.toChars(b));
            else { b2u[b] = new String(Character.toChars(256 + n)); n++; }
        }
    }

    public int specialId(String token) {
        Integer id = special.get(token);
        if (id == null) throw new IllegalArgumentException("unknown special token " + token);
        return id;
    }

    private int[] bpe(String word) {
        int[] hit = cache.get(word);
        if (hit != null) return hit;
        List<String> parts = new ArrayList<>();
        for (int i = 0; i < word.length(); ) { int cp = word.codePointAt(i); parts.add(new String(Character.toChars(cp))); i += Character.charCount(cp); }
        while (parts.size() > 1) {
            int best = Integer.MAX_VALUE, idx = -1;
            for (int i = 0; i < parts.size() - 1; i++) {
                Integer rk = ranks.get(parts.get(i) + " " + parts.get(i + 1));
                if (rk != null && rk < best) { best = rk; idx = i; }
            }
            if (idx < 0) break;
            parts.set(idx, parts.get(idx) + parts.get(idx + 1));
            parts.remove(idx + 1);
        }
        List<Integer> ids = new ArrayList<>();
        for (String p : parts) { Integer id = vocab.get(p); if (id != null) ids.add(id); }
        int[] out = new int[ids.size()];
        for (int i = 0; i < out.length; i++) out[i] = ids.get(i);
        if (cache.size() < 50000) cache.put(word, out);
        return out;
    }

    public List<Integer> encode(String text) {
        String t = Normalizer.normalize(text.toLowerCase(Locale.ROOT), Normalizer.Form.NFC);
        List<Integer> ids = new ArrayList<>();
        Matcher m = PAT.matcher(t);
        while (m.find()) {
            byte[] b = m.group().getBytes(StandardCharsets.UTF_8);
            StringBuilder sb = new StringBuilder();
            for (byte x : b) sb.append(b2u[x & 0xff]);
            for (int id : bpe(sb.toString())) ids.add(id);
        }
        return ids;
    }
}
