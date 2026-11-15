package ai.neu205.one.evidence;

import java.io.FileInputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

/** HybridParity corpus manifest vectors.bin vectors_sha dim tokenizer.json questions.txt qvecs.bin -> per question: "ids|top10" */
public final class HybridParity {
    public static void main(String[] a) throws Exception {
        EvidenceIndex ix = EvidenceIndex.load(new FileInputStream(a[0]), new FileInputStream(a[1]));
        int dim = Integer.parseInt(a[4]);
        ix.attachDense(Files.readAllBytes(Paths.get(a[2])), a[3], dim, q -> { throw new UnsupportedOperationException(); });
        if (ix.loadError() != null) throw new IllegalStateException(ix.loadError());
        WordPiece wp = new WordPiece(new String(Files.readAllBytes(Paths.get(a[5])), StandardCharsets.UTF_8), 256);
        List<String> qs = Files.readAllLines(Paths.get(a[6]), StandardCharsets.UTF_8);
        float[] all = new float[qs.size() * dim];
        ByteBuffer.wrap(Files.readAllBytes(Paths.get(a[7]))).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(all);
        for (int i = 0; i < qs.size(); i++) {
            long[] ids = wp.encode("Represent this sentence for searching relevant passages: " + qs.get(i));
            StringBuilder b = new StringBuilder();
            for (long x : ids) b.append(x).append(' ');
            float[] qv = java.util.Arrays.copyOfRange(all, i * dim, (i + 1) * dim);
            b.append('|');
            for (int r : ix.rankWithVector(qs.get(i), qv, 10)) b.append(ix.chunkId(r)).append(' ');
            System.out.println(b.toString().trim());
        }
    }
}
