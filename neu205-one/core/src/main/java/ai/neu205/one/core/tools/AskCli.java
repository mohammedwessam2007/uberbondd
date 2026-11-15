package ai.neu205.one.core.tools;

import ai.neu205.one.core.Dialogue;
import ai.neu205.one.core.KnowledgeBase;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

/** Host CLI: AskCli kb.json "question 1" "question 2" ... (one conversation). */
public final class AskCli {
    public static void main(String[] a) throws Exception {
        long t0 = System.nanoTime();
        KnowledgeBase kb = KnowledgeBase.fromJson(new String(Files.readAllBytes(Paths.get(a[0])), StandardCharsets.UTF_8));
        long t1 = System.nanoTime();
        System.out.printf("loaded %d topics / %d units in %.1f ms%n", kb.topics.size(), kb.unitCount, (t1 - t0) / 1e6);
        Dialogue d = new Dialogue(kb);
        for (int i = 1; i < a.length; i++) {
            long s = System.nanoTime();
            Dialogue.Reply r = d.answer(a[i]);
            System.out.printf("Q: %s%n   -> %s  (%.2f ms)%n", a[i], r, (System.nanoTime() - s) / 1e6);
        }
    }
}
