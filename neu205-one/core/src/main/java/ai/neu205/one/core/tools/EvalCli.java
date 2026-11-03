package ai.neu205.one.core.tools;

import ai.neu205.one.core.Dialogue;
import ai.neu205.one.core.KnowledgeBase;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

/** EvalCli kb.json questions.tsv  -> per-question kind and whether the cited chapter matches. */
public final class EvalCli {
    public static void main(String[] a) throws Exception {
        KnowledgeBase kb = KnowledgeBase.fromJson(new String(Files.readAllBytes(Paths.get(a[0])), StandardCharsets.UTF_8));
        List<String> lines = Files.readAllLines(Paths.get(a[1]), StandardCharsets.UTF_8);
        int n = 0, answered = 0, inChapter = 0, clarify = 0, notFound = 0;
        for (String line : lines) {
            String[] f = line.split("\t");
            if (f.length < 2) continue;
            n++;
            Dialogue.Reply r = new Dialogue(kb).answer(f[0]);
            boolean same = r.kind == Dialogue.Kind.ANSWER && r.chapter.equals(f[1]);
            if (r.kind == Dialogue.Kind.ANSWER) answered++;
            if (same) inChapter++;
            if (r.kind == Dialogue.Kind.CLARIFY) clarify++;
            if (r.kind == Dialogue.Kind.NOT_FOUND) notFound++;
            System.out.println((same ? "OK   " : r.kind == Dialogue.Kind.ANSWER ? "XCH  " : "NOA  ") + f[0] + " -> " + r.kind + " [" + r.citation + "] " + r.speech.substring(0, Math.min(90, r.speech.length())));
        }
        System.out.printf("%nILO-EVAL n=%d answered=%d answered_in_correct_chapter=%d clarify=%d not_found=%d%n", n, answered, inChapter, clarify, notFound);
    }
}
