package ai.neu205.one.core.audio;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Byte-level BPE *decoding* for Whisper (ids -> text). The vocabulary is shipped as one token
 * string per line (line number = id), generated on host from vocab.json by tools/export_tokens.py.
 */
public final class WhisperTokens {
    public static final int EOT = 50257, SOT = 50258, EN = 50259, TRANSCRIBE = 50359, NO_TIMESTAMPS = 50363;
    private final String[] vocab;
    private final int[] u2b = new int[512];

    public WhisperTokens(List<String> lines) {
        vocab = lines.toArray(new String[0]);
        java.util.Arrays.fill(u2b, -1);
        int n = 0;
        for (int b = 0; b < 256; b++) {
            boolean printable = (b >= '!' && b <= '~') || (b >= 0xA1 && b <= 0xAC) || (b >= 0xAE && b <= 0xFF);
            if (printable) u2b[b] = b;
        }
        for (int b = 0; b < 256; b++) {
            boolean printable = (b >= '!' && b <= '~') || (b >= 0xA1 && b <= 0xAC) || (b >= 0xAE && b <= 0xFF);
            if (!printable) { u2b[256 + n] = b; n++; }
        }
    }

    public int size() { return vocab.length; }

    public String decode(int[] ids, int count) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (int i = 0; i < count; i++) {
            int id = ids[i];
            if (id < 0 || id >= EOT || id >= vocab.length) continue; // specials never become text
            String t = vocab[id];
            for (int c = 0; c < t.length(); c++) {
                int ch = t.charAt(c);
                if (ch < u2b.length && u2b[ch] >= 0) out.write(u2b[ch]);
            }
        }
        return new String(out.toByteArray(), StandardCharsets.UTF_8).trim();
    }
}
