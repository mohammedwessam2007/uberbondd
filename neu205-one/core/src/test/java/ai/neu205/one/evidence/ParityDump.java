package ai.neu205.one.evidence;

import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

/** ParityDump corpus.jsonl manifest.json questions.txt -> one line per question: top-10 chunk ids. */
public final class ParityDump {
    public static void main(String[] a) throws Exception {
        EvidenceIndex ix = EvidenceIndex.load(new FileInputStream(a[0]), new FileInputStream(a[1]));
        if (ix.loadError() != null) throw new IllegalStateException(ix.loadError());
        long t0 = System.nanoTime();
        List<String> qs = Files.readAllLines(Paths.get(a[2]), StandardCharsets.UTF_8);
        for (String q : qs) {
            System.out.println(String.join(" ", ix.rawTop(q, 10)));
        }
        System.err.printf("java mean ms/query %.3f%n", (System.nanoTime() - t0) / 1e6 / qs.size());
    }
}
