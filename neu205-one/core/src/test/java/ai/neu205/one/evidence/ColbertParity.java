package ai.neu205.one.evidence;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/** ColbertParity tokenizer.json docs.f16 counts.txt questions.txt q.f32 qcounts.txt -> per question "ids|top10rows" */
public final class ColbertParity {
    public static void main(String[] a) throws Exception {
        ByteBpe bpe = new ByteBpe(new String(Files.readAllBytes(Paths.get(a[0])), StandardCharsets.UTF_8));
        List<Integer> counts = new ArrayList<>();
        for (String l : Files.readAllLines(Paths.get(a[2]))) if (!l.isEmpty()) counts.add(Integer.parseInt(l.trim()));
        ColbertIndex ix = new ColbertIndex(Files.readAllBytes(Paths.get(a[1])), ColbertIndex.offsetsFromCounts(counts));
        List<String> qs = Files.readAllLines(Paths.get(a[3]), StandardCharsets.UTF_8);
        ByteBuffer qb = ByteBuffer.wrap(Files.readAllBytes(Paths.get(a[4]))).order(ByteOrder.LITTLE_ENDIAN);
        List<String> qc = Files.readAllLines(Paths.get(a[5]));
        for (int i = 0; i < qc.size(); i++) {
            int n = Integer.parseInt(qc.get(i).trim());
            float[][] q = new float[n][ColbertIndex.DIM];
            for (int t = 0; t < n; t++) for (int j = 0; j < ColbertIndex.DIM; j++) q[t][j] = qb.getFloat();
            StringBuilder b = new StringBuilder();
            for (int id : bpe.encode(qs.get(i))) b.append(id).append(' ');
            b.append('|');
            for (int r : ix.top(q, 10)) b.append(r).append(' ');
            System.out.println(b.toString().trim());
        }
    }
}
