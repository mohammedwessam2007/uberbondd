package ai.neu205.one.core;

import java.util.LinkedHashMap;
import java.util.Map;

/** Synthetic host regressions; no textbook or exam material. */
public final class McqNegativeSafetyTests {
    private static McqSolver solver(String text) {
        String json = "{\"meta\":{\"source_text_sha256\":\"synthetic\"},\"units\":["
            + "{\"id\":\"u1\",\"chapter\":\"1\",\"topic\":\"Widget\",\"relation\":\"contents\",\"text\":\""
            + text + "\",\"page\":1}],\"teaching\":[]}";
        return new McqSolver(KnowledgeBase.fromJson(json));
    }
    private static Map<String, String> options() {
        Map<String, String> options = new LinkedHashMap<>();
        options.put("A", "alpha"); options.put("B", "beta"); options.put("C", "gamma");
        return options;
    }
    private static void abstains(String name, String text) {
        McqSolver.Choice result = solver(text).solve("Which does the widget contain except?", options());
        if (!"ABSTAIN".equals(result.letter)) {
            throw new AssertionError(name + ": selected " + result.letter + "; " + result.reason);
        }
        if (!result.evidence.isEmpty() || !result.citation.isEmpty() || result.confidence != 0)
            throw new AssertionError(name + ": abstention exposed asserted evidence or confidence");
        if (!"ABSTAIN".equals(result.forcedLetter))
            throw new AssertionError(name + ": forced answer exported for an unverified exclusion");
        System.out.println("PASS " + name + " (forced diagnostic: " + result.forcedLetter + ")");
    }
    public static void main(String[] args) {
        abstains("omission is not exclusion", "The widget contains alpha. The widget contains beta.");
        abstains("negation does not scope over other clause", "The widget does not contain beta, but contains alpha.");
        abstains("negation is not an entailment verifier", "The widget contains alpha and beta, but not gamma.");
        McqSolver.Choice positive = solver("The widget contains alpha.")
                .solve("Which does the widget contain?", options());
        if (!"A".equals(positive.letter)) throw new AssertionError("positive path changed: " + positive.letter);
        System.out.println("PASS positive stem still resolves synthetic exact-match example");
    }
}
