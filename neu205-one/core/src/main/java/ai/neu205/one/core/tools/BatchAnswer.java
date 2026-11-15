package ai.neu205.one.core.tools;

import ai.neu205.one.core.Dialogue;
import ai.neu205.one.core.KnowledgeBase;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

/** BatchAnswer kb.json transcripts.txt : one fresh conversation per line; prints kind<TAB>citation<TAB>speech. */
public final class BatchAnswer {
    public static void main(String[] a) throws Exception {
        KnowledgeBase kb = KnowledgeBase.fromJson(new String(Files.readAllBytes(Paths.get(a[0])), StandardCharsets.UTF_8));
        for (String q : Files.readAllLines(Paths.get(a[1]), StandardCharsets.UTF_8)) {
            Dialogue.Reply r = new Dialogue(kb).answer(q);
            System.out.println(r.kind + "\t" + r.citation + "\t" + r.speech.replace('\t', ' ').replace('\n', ' ')
                    + "\t" + r.display.replace('\t', ' ').replace('\n', ' '));
        }
    }
}
