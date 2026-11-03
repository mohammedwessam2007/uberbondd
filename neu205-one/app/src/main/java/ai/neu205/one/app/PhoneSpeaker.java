package ai.neu205.one.app;

import ai.neu205.one.core.Conversation;
import android.content.Context;
import android.media.AudioAttributes;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import java.util.Locale;
import java.util.Set;

/**
 * Speech output through the platform TTS engine using ONLY an installed, offline English voice
 * (voice-selection rule reused from the v8 donor, relaxed to pick the best offline voice instead
 * of failing when the default voice needs the network). Phase 1 = phone speaker: no headset
 * routing logic; audio goes to the system default output with assistant/speech attributes.
 * onStart (synthesis began) is recorded as a NON-acoustic proxy; true audible onset needs a mic.
 */
final class PhoneSpeaker implements Conversation.Speaker {
    interface Callbacks {
        void onReady(String voiceDescription);
        void onUnavailable(String why);
        void onStarted(int gen);
        void onDone(int gen);
        /** Synthesis/playback failed: the user heard nothing for this turn. */
        void onFailed(int gen, String why);
    }

    private final TextToSpeech tts;
    private final Callbacks cb;
    private volatile boolean ready;
    String voiceDescription = "not ready";

    PhoneSpeaker(Context ctx, Callbacks cb) {
        this.cb = cb;
        this.tts = new TextToSpeech(ctx.getApplicationContext(), this::onInit);
    }

    private void onInit(int status) {
        if (status != TextToSpeech.SUCCESS) { cb.onUnavailable("Text-to-speech engine did not start"); return; }
        Voice best = null;
        int bestScore = Integer.MIN_VALUE;
        Set<Voice> voices = null;
        try { voices = tts.getVoices(); } catch (RuntimeException ignored) { }
        if (voices != null) {
            for (Voice v : voices) {
                if (v.getLocale() == null || !"en".equals(v.getLocale().getLanguage())) continue;
                if (v.isNetworkConnectionRequired()) continue;
                Set<String> f = v.getFeatures();
                if (f != null && f.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                int score = v.getQuality() - v.getLatency() / 2;
                if ("US".equals(v.getLocale().getCountry()) || "GB".equals(v.getLocale().getCountry())) score += 50;
                if (score > bestScore) { best = v; bestScore = score; }
            }
        }
        if (best == null || tts.setVoice(best) != TextToSpeech.SUCCESS) {
            cb.onUnavailable("No offline English voice is installed. Open Settings > Text-to-speech and download an English voice once.");
            return;
        }
        tts.setSpeechRate(1.05f);
        tts.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { cb.onStarted(gen(id)); }
            @Override public void onDone(String id) { cb.onDone(gen(id)); }
            @SuppressWarnings("deprecation") @Override public void onError(String id) { cb.onFailed(gen(id), "voice output error"); }
            @Override public void onError(String id, int code) { cb.onFailed(gen(id), "voice output error " + code); }
            @Override public void onStop(String id, boolean interrupted) { /* Stop path handled by generation */ }
        });
        voiceDescription = best.getName() + " (" + best.getLocale() + ", offline, q" + best.getQuality() + ")";
        ready = true;
        cb.onReady(voiceDescription);
    }

    private static int gen(String id) {
        try { return Integer.parseInt(id.substring(0, id.indexOf('-'))); } catch (RuntimeException e) { return -1; }
    }

    boolean isReady() { return ready; }

    private int seq;

    @Override public void speak(int generation, String text) {
        if (!ready) { cb.onFailed(generation, "offline voice not ready"); return; }
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
        if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, generation + "-" + (seq++)) != TextToSpeech.SUCCESS) {
            cb.onFailed(generation, "voice engine rejected the request");
        }
    }

    @Override public void stop() { if (ready) tts.stop(); }

    void shutdown() { tts.stop(); tts.shutdown(); }

    static String localeName() { return Locale.getDefault().toLanguageTag(); }
}
