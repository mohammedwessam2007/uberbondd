package ai.neu205.one.core;

/**
 * One-tap conversation controller. Platform-neutral: Android supplies Audio/Recognizer/Speaker
 * implementations; tests supply fakes.
 *
 * STOPPED -> PREPARING -> LISTENING -> RECOGNIZING -> RESOLVING -> SPEAKING -> LISTENING ...
 * Any state -> STOPPED on stop(). ERROR is terminal until the user taps Start again.
 *
 * Every asynchronous callback carries the generation it was issued under. stop() and start()
 * bump the generation, so late ASR/TTS callbacks from an earlier session are dropped and can
 * never produce speech after Stop. Half-duplex: the microphone is muted while SPEAKING and for
 * a short tail afterwards so the phone speaker's own voice is not transcribed.
 */
public final class Conversation {

    public enum State { STOPPED, PREPARING, LISTENING, RECOGNIZING, RESOLVING, SPEAKING, ERROR }

    public interface Mic {
        /** Start delivering utterances via Conversation.onUtterance(gen, pcm). Returns false if capture failed. */
        boolean start(int generation);
        void stop();
        /** true = discard captured audio (half-duplex while speaking). */
        void setMuted(boolean muted);
    }

    public interface Recognizer {
        /** Must eventually call Conversation.onTranscript(gen, text) or onRecognizerError(gen, msg). */
        void recognize(int generation, float[] pcm16k);
        void cancel();
    }

    public interface Speaker {
        /** Must eventually call Conversation.onSpoken(gen). */
        void speak(int generation, String text);
        void stop();
    }

    public interface Listener {
        void onState(State s, String detail);
        void onReply(String question, Dialogue.Reply reply);
    }

    public interface Clock { long nowMs(); }

    private final Dialogue dialogue;
    private final Mic mic;
    private final Recognizer recognizer;
    private final Speaker speaker;
    private final Listener listener;
    private final Clock clock;
    private State state = State.STOPPED;
    private int generation = 0;
    private String lastQuestion = "";

    /** Timing of the last turn (ms, monotonic clock): utterance end, transcript, reply, speech request. */
    public long tUtteranceEnd, tTranscript, tReply, tSpeakRequested, tSpoken;

    public Conversation(Dialogue d, Mic mic, Recognizer r, Speaker s, Listener l, Clock c) {
        this.dialogue = d; this.mic = mic; this.recognizer = r; this.speaker = s; this.listener = l; this.clock = c;
    }

    public synchronized State state() { return state; }
    public synchronized int generation() { return generation; }

    /** User tapped Start. */
    public synchronized void start() {
        if (state != State.STOPPED && state != State.ERROR) return; // idempotent
        generation++;
        dialogue.reset();
        set(State.PREPARING, "");
        mic.setMuted(false);
        if (!mic.start(generation)) {
            fail("Microphone unavailable");
            return;
        }
        set(State.LISTENING, "");
    }

    /** User tapped Stop: capture, recognition and speech are cancelled immediately. */
    public synchronized void stop() {
        generation++;
        mic.stop();
        recognizer.cancel();
        speaker.stop();
        dialogue.reset();
        set(State.STOPPED, "");
    }

    /** Mic/VAD delivered one complete utterance. */
    public synchronized void onUtterance(int gen, float[] pcm) {
        if (gen != generation || state != State.LISTENING) return; // stale, or busy (half-duplex)
        tUtteranceEnd = clock.nowMs();
        set(State.RECOGNIZING, "");
        mic.setMuted(true);
        recognizer.recognize(gen, pcm);
    }

    public synchronized void onTranscript(int gen, String text) {
        if (gen != generation || state != State.RECOGNIZING) return;
        tTranscript = clock.nowMs();
        set(State.RESOLVING, "");
        lastQuestion = text == null ? "" : text.trim();
        Dialogue.Reply reply = dialogue.answer(lastQuestion);
        tReply = clock.nowMs();
        if (reply.kind == Dialogue.Kind.NOT_HEARD || reply.speech.isEmpty()) {
            resumeListening(gen); // silence / noise: no fake context, no speech
            return;
        }
        listener.onReply(lastQuestion, reply);
        set(State.SPEAKING, "");
        tSpeakRequested = clock.nowMs();
        speaker.speak(gen, reply.speech);
    }

    public synchronized void onRecognizerError(int gen, String msg) {
        if (gen != generation) return;
        resumeListening(gen); // one bad decode must not end the session
    }

    public synchronized void onSpoken(int gen) {
        if (gen != generation || state != State.SPEAKING) return;
        tSpoken = clock.nowMs();
        resumeListening(gen);
    }

    /** Fatal platform problem (permission revoked, audio focus lost permanently...). */
    public synchronized void onFatal(int gen, String why) {
        if (gen != generation) return;
        fail(why);
    }

    private void resumeListening(int gen) {
        if (gen != generation) return;
        mic.setMuted(false); // platform Mic applies its own post-speech tail before unmuting
        set(State.LISTENING, "");
    }

    private void fail(String why) {
        generation++;
        mic.stop();
        recognizer.cancel();
        speaker.stop();
        set(State.ERROR, why);
    }

    private void set(State s, String detail) {
        state = s;
        listener.onState(s, detail);
    }
}
