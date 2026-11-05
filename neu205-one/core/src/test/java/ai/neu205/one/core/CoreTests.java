package ai.neu205.one.core;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/**
 * Dependency-free host tests. Run: java -cp build/core:build/test ai.neu205.one.core.CoreTests [private/kb.json]
 * Without a KB path, only the synthetic (commit-safe) tests run; KB tests are reported SKIPPED.
 */
public final class CoreTests {
    static int pass, fail, skip;
    static final List<String> failures = new ArrayList<>();

    static void check(boolean ok, String name) {
        if (ok) pass++; else { fail++; failures.add(name); }
        System.out.println((ok ? "PASS " : "FAIL ") + name);
    }

    // ---------- synthetic KB (no course text) ----------
    static final String SYNTH = "{\"meta\":{\"source_text_sha256\":\"synthetic\"},\"units\":["
            + "{\"id\":\"u1\",\"chapter\":\"C1\",\"topic\":\"Widget Sheath\",\"relation\":\"definition\",\"text\":\"A synthetic tube around the widget.\",\"page\":1},"
            + "{\"id\":\"u2\",\"chapter\":\"C1\",\"topic\":\"Widget Sheath\",\"relation\":\"contents\",\"text\":\"1- Alpha rod. 2- Beta rod.\",\"page\":2}"
            + "],\"teaching\":[]}";

    static final class Fake implements Conversation.Mic, Conversation.Recognizer, Conversation.Speaker,
            Conversation.Listener, Conversation.Clock {
        boolean micOn, muted, micFails;
        int recognizeCalls, speakCalls, speakerStops, recCancels;
        int lastRecGen = -1, lastSpeakGen = -1;
        String lastSpoken;
        List<Conversation.State> states = new ArrayList<>();
        long t;
        public boolean start(int g) { if (micFails) return false; micOn = true; return true; }
        public void stop() { micOn = false; }
        public void setMuted(boolean m) { muted = m; }
        public void recognize(int g, float[] pcm) { recognizeCalls++; lastRecGen = g; }
        public void cancel() { recCancels++; }
        public void speak(int g, String text) { speakCalls++; lastSpeakGen = g; lastSpoken = text; }
        public void onState(Conversation.State s, String d) { states.add(s); }
        public void onReply(String q, Dialogue.Reply r) {}
        public long nowMs() { return t++; }
    }

    static Conversation conv(Fake f) {
        // Speaker.stop and Mic.stop share the name stop(); Fake implements both the same way, so wrap.
        Conversation.Speaker sp = new Conversation.Speaker() {
            public void speak(int g, String text) { f.speak(g, text); }
            public void stop() { f.speakerStops++; }
        };
        return new Conversation(new Dialogue(KnowledgeBase.fromJson(SYNTH)), f, f, sp, f, f);
    }

    static void stateMachineTests() {
        Fake f = new Fake();
        Conversation c = conv(f);
        c.start();
        check(c.state() == Conversation.State.LISTENING && f.micOn, "start -> LISTENING only after mic started");
        int g = c.generation();
        c.onUtterance(g, new float[16000]);
        check(c.state() == Conversation.State.RECOGNIZING && f.muted, "utterance -> RECOGNIZING, mic muted (half-duplex)");
        c.onTranscript(g, "What is the widget sheath?");
        check(c.state() == Conversation.State.SPEAKING && f.speakCalls == 1 && f.lastSpoken.contains("synthetic tube"), "transcript -> grounded speech");
        c.onUtterance(g, new float[16000]);
        check(f.recognizeCalls == 1, "utterance while SPEAKING is ignored (no self-transcription)");
        c.onSpoken(g);
        check(c.state() == Conversation.State.LISTENING && !f.muted, "spoken -> LISTENING again without a tap");
        c.onUtterance(g, new float[16000]);
        c.onTranscript(g, "What does it contain?");
        check(f.lastSpoken.contains("Alpha rod") && f.lastSpoken.contains("Beta rod"), "pronoun follow-up resolves to previous topic");
        c.onSpoken(g);

        // Stop during recognition: late transcript must not speak.
        c.onUtterance(g, new float[16000]);
        int spokenBefore = f.speakCalls;
        c.stop();
        check(c.state() == Conversation.State.STOPPED && !f.micOn && f.recCancels > 0 && f.speakerStops > 0, "stop cancels mic, ASR and speech");
        c.onTranscript(g, "What is the widget sheath?");
        check(f.speakCalls == spokenBefore && c.state() == Conversation.State.STOPPED, "late transcript after Stop is dropped");
        c.onUtterance(g, new float[16000]);
        check(f.recognizeCalls == 3 && c.state() == Conversation.State.STOPPED, "utterance after Stop produces nothing");

        // Stop during speech: late onSpoken must not reopen the mic.
        c.start();
        int g2 = c.generation();
        check(g2 != g, "new session gets a new generation");
        c.onUtterance(g2, new float[16000]);
        c.onTranscript(g2, "What is the widget sheath?");
        c.stop();
        c.onSpoken(g2);
        check(c.state() == Conversation.State.STOPPED && !f.micOn, "late speech-complete after Stop keeps STOPPED");

        // Context reset on stop.
        c.start();
        int g3 = c.generation();
        c.onUtterance(g3, new float[16000]);
        c.onTranscript(g3, "What does it contain?");
        check(!f.lastSpoken.contains("Alpha rod"), "context is cleared by Stop (no stale pronoun resolution)");
        c.stop();

        // Noise / empty transcript: no speech, back to listening.
        c.start();
        int g4 = c.generation();
        int sc = f.speakCalls;
        c.onUtterance(g4, new float[16000]);
        c.onTranscript(g4, "   ");
        check(f.speakCalls == sc && c.state() == Conversation.State.LISTENING, "empty transcript -> silent return to LISTENING");
        c.onUtterance(g4, new float[16000]);
        c.onRecognizerError(g4, "decode failed");
        check(c.state() == Conversation.State.LISTENING, "ASR error does not end session");
        c.stop();

        // Rapid start/stop x20.
        boolean ok = true;
        for (int i = 0; i < 20; i++) {
            c.start(); c.start(); // double tap idempotent
            if (c.state() != Conversation.State.LISTENING) ok = false;
            c.stop(); c.stop();
            if (c.state() != Conversation.State.STOPPED || f.micOn) ok = false;
        }
        check(ok, "rapid Start/Stop x20 stays consistent");

        // Mic failure -> ERROR, recoverable by Start.
        f.micFails = true;
        c.start();
        check(c.state() == Conversation.State.ERROR, "mic failure -> ERROR (no false Listening)");
        f.micFails = false;
        c.start();
        check(c.state() == Conversation.State.LISTENING, "Start recovers from ERROR");
        c.stop();
    }

    static void textTests() {
        check("contents".equals(Text.relation("What does the carotid sheath contain?")), "relation: contain -> contents");
        check("boundaries".equals(Text.relation("What are its boundaries?")), "relation: boundaries distinct");
        check("attachments".equals(Text.relation("Where is it attached?")), "relation: attachments distinct");
        check("formation".equals(Text.relation("How is it formed?")), "relation: formation distinct");
        check(Text.relation("What is the carotid sheath?") == null, "relation: definition question");
        check(!Text.topicTokens("What does it contain?").contains("doe"), "stopword 'does' not stemmed into a topic word");
        check(Text.speakable("1- A & B. 2- C -> D.").equals("A and B. C leads to D."), "speakable strips numbering, expands symbols");
        String[] sp = Text.splitForSpeech("One two three. Four five six. Seven eight nine.", 6);
        check(sp[0].equals("One two three. Four five six.") && sp[1].equals("Seven eight nine."), "speech split at sentence boundary");
    }

    /**
     * Course-derived expectations live in an owner-private TSV next to the private study pack
     * (never committed: the repository is public). Lines: conv, question, expected kind
     * (KIND, !KIND = must not be KIND, !CONTAINS = must not contain), required substrings.
     */
    static void kbTests(KnowledgeBase kb, Path expectations) throws Exception {
        java.util.Map<String, Dialogue> convs = new java.util.HashMap<>();
        for (String line : Files.readAllLines(expectations, StandardCharsets.UTF_8)) {
            if (line.startsWith("#") || line.trim().isEmpty()) continue;
            String[] f = line.split("\t", -1);
            Dialogue d = convs.computeIfAbsent(f[0], k -> new Dialogue(kb));
            Dialogue.Reply r = d.answer(f[1]);
            String all = r.speech + " " + r.display + " " + r.citation;
            boolean ok;
            if (f[2].equals("!CONTAINS")) ok = !all.toLowerCase().contains(f[3].toLowerCase());
            else if (f[2].startsWith("!")) ok = !r.kind.name().equals(f[2].substring(1));
            else {
                ok = r.kind.name().equals(f[2]);
                if (f.length > 3 && !f[3].isEmpty()) for (String sub : f[3].split("\\|")) ok &= all.contains(sub);
            }
            check(ok, "kb[" + f[0] + "] " + f[1] + " -> " + r.kind);
        }
        long t0 = System.nanoTime();
        for (int i = 0; i < 50; i++) new Dialogue(kb).answer("What does the carotid sheath contain?");
        double ms = (System.nanoTime() - t0) / 1e6 / 50;
        System.out.printf("info: mean resolve %.2f ms%n", ms);
        check(ms < 50, "resolution < 50 ms on host");
    }

    public static void main(String[] args) throws Exception {
        textTests();
        stateMachineTests();
        if (args.length > 1 && !args[0].isEmpty() && !args[1].isEmpty() && Files.isRegularFile(Paths.get(args[0])) && Files.isRegularFile(Paths.get(args[1]))) {
            Path p = Paths.get(args[0]);
            kbTests(KnowledgeBase.fromJson(new String(Files.readAllBytes(p), StandardCharsets.UTF_8)), Paths.get(args[1]));
        } else {
            skip++;
            System.out.println("SKIP private KB tests (needs private kb.json + kb_expectations.tsv)");
        }
        System.out.printf("%nRESULT pass=%d fail=%d skipped_groups=%d%n", pass, fail, skip);
        for (String f : failures) System.out.println("  failed: " + f);
        System.exit(fail == 0 ? 0 : 1);
    }
}
