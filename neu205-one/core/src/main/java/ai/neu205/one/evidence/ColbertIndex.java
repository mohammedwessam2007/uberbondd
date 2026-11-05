package ai.neu205.one.evidence;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.List;

/**
 * Late-interaction (MaxSim) index for mxbai-edge-colbert-v0-17m: per-chunk L2-normalised 48-d token
 * vectors stored as float16 little-endian, concatenated in corpus order, with a row-offset table.
 * The query token matrix comes from a {@link QueryEncoder} running the official ONNX on device.
 */
public final class ColbertIndex {
    public interface QueryEncoder {
        /** [n_tokens][48] L2-normalised query token vectors: [CLS] [Q] tokens [SEP], max 48 tokens. */
        float[][] encode(String query) throws Exception;
    }

    public static final int DIM = 48;
    private final short[] half;
    private final int[] offsets; // token-row start per chunk; offsets[n] = total rows

    public ColbertIndex(byte[] f16le, int[] offsets) {
        if ((long) offsets[offsets.length - 1] * DIM * 2 != f16le.length) throw new IllegalArgumentException("colbert file size mismatch");
        this.offsets = offsets;
        half = new short[f16le.length / 2];
        ByteBuffer.wrap(f16le).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(half);
    }

    public int size() { return offsets.length - 1; }

    static float h2f(short h) {
        int bits = h & 0xffff, e = (bits >>> 10) & 0x1f, m = bits & 0x3ff, s = bits >>> 15;
        float v;
        if (e == 0) v = (float) (m * Math.pow(2, -24));
        else if (e == 31) v = m == 0 ? Float.POSITIVE_INFINITY : Float.NaN;
        else v = (float) ((1 + m / 1024.0) * Math.pow(2, e - 15));
        return s == 1 ? -v : v;
    }

    private static final float[] LUT = new float[65536];
    static { for (int i = 0; i < 65536; i++) LUT[i] = h2f((short) i); }

    /** MaxSim score of every chunk; same arithmetic as retrieval/colbert.py maxsim (float32 accumulation). */
    public double[] scoreAll(float[][] q) {
        double[] sc = new double[size()];
        for (int c = 0; c < size(); c++) {
            double total = 0;
            for (float[] qv : q) {
                float best = Float.NEGATIVE_INFINITY;
                for (int r = offsets[c]; r < offsets[c + 1]; r++) {
                    int o = r * DIM;
                    float d = 0;
                    for (int j = 0; j < DIM; j++) d += qv[j] * LUT[half[o + j] & 0xffff];
                    if (d > best) best = d;
                }
                total += best;
            }
            sc[c] = total;
        }
        return sc;
    }

    public int[] top(float[][] q, int k) {
        double[] s = scoreAll(q);
        k = Math.min(k, s.length);
        int[] idx = new int[k];
        boolean[] used = new boolean[s.length];
        for (int t = 0; t < k; t++) {
            int best = -1;
            for (int i = 0; i < s.length; i++) if (!used[i] && (best < 0 || s[i] > s[best])) best = i;
            used[best] = true; idx[t] = best;
        }
        return idx;
    }

    /** Builds the offsets table from per-chunk token counts. */
    public static int[] offsetsFromCounts(List<Integer> counts) {
        int[] o = new int[counts.size() + 1];
        for (int i = 0; i < counts.size(); i++) o[i + 1] = o[i] + counts.get(i);
        return o;
    }
}
