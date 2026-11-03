package ai.neu205.one.app;

import android.os.Handler;
import android.os.Looper;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * In-process UI bus + metadata-only diagnostics (memory only; nothing is written to disk and no
 * audio is retained). Turn timings are software timestamps, NOT acoustic measurements.
 */
final class Hub {
    interface View {
        void onState(String state, String detail);
        void onReply(String question, String answer, String citation, String kind);
        void onLevel(double rms, double noise, boolean inSpeech);
    }

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final List<View> views = new ArrayList<>();
    private static final Map<String, String> diag = new LinkedHashMap<>();
    private static final ArrayDeque<long[]> turns = new ArrayDeque<>();
    static volatile String state = "STOPPED", detail = "";
    static volatile String lastQ = "", lastA = "", lastCite = "", lastKind = "";

    static void attach(View v) { MAIN.post(() -> { views.add(v); v.onState(state, detail); if (!lastA.isEmpty()) v.onReply(lastQ, lastA, lastCite, lastKind); }); }
    static void detach(View v) { MAIN.post(() -> views.remove(v)); }

    static void state(String s, String d) {
        state = s; detail = d == null ? "" : d;
        MAIN.post(() -> { for (View v : views) v.onState(state, detail); });
    }

    static void reply(String q, String a, String c, String k) {
        lastQ = q; lastA = a; lastCite = c; lastKind = k;
        MAIN.post(() -> { for (View v : views) v.onReply(q, a, c, k); });
    }

    static void level(double rms, double noise, boolean speech) {
        MAIN.post(() -> { for (View v : views) v.onLevel(rms, noise, speech); });
    }

    static synchronized void diag(String k, String v) { diag.put(k, v); }

    /** asr, resolve, ttsQueue, estimated speech-end -> TTS-start (all ms). */
    static synchronized void turn(long asrMs, long resolveMs, long ttsQueueMs, long estEndToVoiceMs) {
        turns.addLast(new long[]{asrMs, resolveMs, ttsQueueMs, estEndToVoiceMs});
        while (turns.size() > 100) turns.removeFirst();
    }

    static synchronized String report() {
        StringBuilder b = new StringBuilder();
        b.append("NEU205 ONE 0.3.0 diagnostics (metadata only)\n");
        b.append("state: ").append(state).append(' ').append(detail).append('\n');
        for (Map.Entry<String, String> e : diag.entrySet()) b.append(e.getKey()).append(": ").append(e.getValue()).append('\n');
        b.append("turns: ").append(turns.size()).append('\n');
        if (!turns.isEmpty()) {
            for (int col = 0; col < 4; col++) {
                long[] v = new long[turns.size()];
                int i = 0;
                for (long[] t : turns) v[i++] = t[col];
                java.util.Arrays.sort(v);
                String name = new String[]{"asr_ms", "resolve_ms", "tts_queue_ms", "est_speech_end_to_tts_start_ms"}[col];
                b.append(String.format(Locale.US, "%s p50=%d p95=%d max=%d%n", name, v[v.length / 2],
                        v[Math.min(v.length - 1, (int) Math.ceil(v.length * 0.95) - 1)], v[v.length - 1]));
            }
        }
        b.append("NOTE: timings are software timestamps; audible latency must be measured acoustically.\n");
        return b.toString();
    }
}
