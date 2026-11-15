package ai.neu205.one.evidence;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;

/**
 * Precomputed L2-normalised passage vectors (float32 little-endian, row-major, rows aligned with
 * corpus.jsonl order) + exact dot-product search. Integrity is checked by the caller via the
 * dense manifest digest. The query vector comes from a {@link QueryEncoder} (ONNX Runtime on Android).
 */
public final class DenseIndex {
    public interface QueryEncoder {
        /** L2-normalised query embedding (the encoder applies the model's query prefix). */
        float[] encode(String query) throws Exception;
    }

    final int rows, dim;
    private final float[] m;

    public DenseIndex(byte[] f32le, int rows, int dim) {
        if ((long) rows * dim * 4 != f32le.length) throw new IllegalArgumentException("vector file size mismatch");
        this.rows = rows; this.dim = dim;
        m = new float[rows * dim];
        ByteBuffer.wrap(f32le).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(m);
    }

    /** Top-k row indices by dot product (ties by lower index). */
    public int[] search(float[] q, int k) {
        if (q.length != dim) throw new IllegalArgumentException("query dim " + q.length + " != " + dim);
        double[] s = new double[rows];
        for (int r = 0, o = 0; r < rows; r++, o += dim) {
            double d = 0;
            for (int j = 0; j < dim; j++) d += m[o + j] * q[j];
            s[r] = d;
        }
        k = Math.min(k, rows);
        int[] idx = new int[k];
        boolean[] used = new boolean[rows];
        for (int t = 0; t < k; t++) {
            int best = -1;
            for (int r = 0; r < rows; r++) if (!used[r] && (best < 0 || s[r] > s[best])) best = r;
            used[best] = true;
            idx[t] = best;
        }
        return idx;
    }

    /** Reciprocal-rank fusion, k=60, identical to retrieval/tournament.py rrf(). */
    public static List<Integer> rrf(List<int[]> rankings, int keep) {
        java.util.Map<Integer, Double> sc = new java.util.HashMap<>();
        java.util.Map<Integer, Integer> firstSeen = new java.util.HashMap<>();
        int order = 0;
        for (int[] r : rankings) {
            for (int rank = 0; rank < r.length; rank++) {
                sc.merge(r[rank], 1.0 / (60 + rank + 1), Double::sum);
                if (!firstSeen.containsKey(r[rank])) firstSeen.put(r[rank], order++);
            }
        }
        List<Integer> ids = new ArrayList<>(sc.keySet());
        // Python sorts a dict built in first-seen order with a stable sort: ties keep first-seen order.
        ids.sort((a, b) -> { int c = Double.compare(sc.get(b), sc.get(a)); return c != 0 ? c : Integer.compare(firstSeen.get(a), firstSeen.get(b)); });
        return ids.subList(0, Math.min(keep, ids.size()));
    }
}
