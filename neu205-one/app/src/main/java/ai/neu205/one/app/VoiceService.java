package ai.neu205.one.app;

import ai.neu205.one.R;
import ai.neu205.one.core.Conversation;
import ai.neu205.one.core.Dialogue;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.media.AudioRecordingConfiguration;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Microphone foreground service started only from a visible user tap (Android 14+ while-in-use
 * rule; no boot/background starts). Owns one Conversation per Start. Stop tears down capture,
 * recognition and speech immediately; generation fences drop every late callback.
 */
public final class VoiceService extends Service implements AudioMic.Sink, PhoneSpeaker.Callbacks,
        Conversation.Recognizer, Conversation.Listener {

    static final String ACTION_START = "ai.neu205.one.START", ACTION_STOP = "ai.neu205.one.STOP";
    private static final String CHANNEL = "session";

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService asr = Executors.newSingleThreadExecutor(r -> new Thread(r, "neu205-asr"));
    private final ExecutorService prep = Executors.newSingleThreadExecutor(r -> new Thread(r, "neu205-prep"));
    private AudioMic mic;
    private PhoneSpeaker speaker;
    private Conversation conv;
    private AudioManager audio;
    private AudioManager.AudioRecordingCallback recCb;
    private volatile boolean wantRunning;
    private long tapAtMs, ttsStartAtMs;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        audio = getSystemService(AudioManager.class);
        mic = new AudioMic(this);
        speaker = new PhoneSpeaker(this, this);
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Study session", NotificationManager.IMPORTANCE_LOW));
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action) || action == null) { // null = system restart: never self-start the mic
            stopSession("");
            return START_NOT_STICKY;
        }
        if (ACTION_START.equals(action)) startSession(intent.getLongExtra("tapAt", SystemClock.elapsedRealtime()));
        return START_NOT_STICKY;
    }

    private void startSession(long tapAt) {
        tapAtMs = tapAt;
        try {
            startForeground(1, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } catch (RuntimeException e) {
            Hub.state("ERROR", "Android blocked the microphone session: " + e.getClass().getSimpleName());
            stopSelf();
            return;
        }
        wantRunning = true;
        Hub.state("PREPARING", Engine.peek() == null ? "Preparing offline models (first time only)" : "");
        prep.execute(() -> {
            Engine e;
            try { e = Engine.get(this); } catch (Throwable t) {
                main.post(() -> { Hub.state("ERROR", t.getMessage() == null ? "Model load failed" : t.getMessage()); stopSession(null); });
                return;
            }
            long waited = 0;
            while (!speaker.isReady() && waited < 8000 && wantRunning) { SystemClock.sleep(50); waited += 50; }
            main.post(() -> {
                if (!wantRunning) return;
                if (!speaker.isReady()) { Hub.state("ERROR", "Offline voice not ready: install an English voice in Settings > Text-to-speech"); stopSession(null); return; }
                Hub.diag("engine", "model " + e.modelName + ", load " + e.whisper.loadMs + " ms, study pack " + e.kb.unitCount + " units/" + e.kb.topics.size() + " topics (" + e.kbLoadMs + " ms)");
                Hub.diag("voice", speaker.voiceDescription);
                conv = new Conversation(new Dialogue(e.kb), mic, this, speaker, this, SystemClock::elapsedRealtime);
                watchMicSilencing();
                conv.start();
                Hub.diag("mic", mic.routeInfo);
                Hub.diag("tap_to_listening_ms", String.valueOf(SystemClock.elapsedRealtime() - tapAtMs));
            });
        });
    }

    private void stopSession(String why) {
        wantRunning = false;
        if (conv != null) conv.stop(); else { mic.stop(); speaker.stop(); }
        conv = null;
        if (recCb != null) { audio.unregisterAudioRecordingCallback(recCb); recCb = null; }
        if (why != null) Hub.state("STOPPED", why);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    /** Calls, other recorders or the OS privacy toggle silence our capture: tell the user instead of hanging. */
    private void watchMicSilencing() {
        recCb = new AudioManager.AudioRecordingCallback() {
            @Override public void onRecordingConfigChanged(List<AudioRecordingConfiguration> configs) {
                for (AudioRecordingConfiguration c : configs) {
                    if (c.getClientAudioSource() == android.media.MediaRecorder.AudioSource.VOICE_RECOGNITION && c.isClientSilenced()) {
                        Conversation cv = conv;
                        if (cv != null) cv.onFatal(cv.generation(), "Microphone is in use by another app or blocked by privacy settings");
                    }
                }
            }
        };
        audio.registerAudioRecordingCallback(recCb, main);
    }

    // ----- Conversation.Recognizer -----
    @Override public void recognize(int gen, float[] pcm) {
        Engine e = Engine.peek();
        asr.execute(() -> {
            try {
                WhisperOnnx.Result r = e.whisper.transcribe(pcm);
                if (r == null) return; // cancelled by Stop
                Hub.diag("last_asr", "mel " + r.melMs + " ms, encoder " + r.encMs + " ms, decoder " + r.decMs + " ms, " + r.nTokens + " tokens, audio " + (pcm.length / 16) + " ms");
                main.post(() -> { Conversation c = conv; if (c != null) c.onTranscript(gen, r.text); });
            } catch (Throwable t) {
                main.post(() -> { Conversation c = conv; if (c != null) c.onRecognizerError(gen, String.valueOf(t.getMessage())); });
            }
        });
    }

    @Override public void cancel() { Engine e = Engine.peek(); if (e != null) e.whisper.cancelled = true; }

    // ----- AudioMic.Sink -----
    @Override public void onUtterance(int gen, float[] pcm) { main.post(() -> { Conversation c = conv; if (c != null) c.onUtterance(gen, pcm); }); }
    @Override public void onMicFailure(int gen, String why) { main.post(() -> { Conversation c = conv; if (c != null) c.onFatal(gen, why); }); }
    @Override public void onLevel(double rms, double noise, boolean inSpeech) { Hub.level(rms, noise, inSpeech); }

    // ----- PhoneSpeaker.Callbacks -----
    @Override public void onReady(String v) { Hub.diag("voice", v); }
    @Override public void onUnavailable(String why) { Hub.diag("voice", "UNAVAILABLE: " + why); }
    @Override public void onStarted(int gen) {
        ttsStartAtMs = SystemClock.elapsedRealtime();
        Conversation c = conv;
        if (c != null && gen == c.generation()) {
            // Utterance end is detected after ~600 ms of trailing silence; subtract it to estimate speech end.
            long speechEnd = c.tUtteranceEnd - 600;
            Hub.turn(c.tTranscript - c.tUtteranceEnd, c.tReply - c.tTranscript, ttsStartAtMs - c.tSpeakRequested, ttsStartAtMs - speechEnd);
        }
    }
    @Override public void onDone(int gen) { main.post(() -> { Conversation c = conv; if (c != null) c.onSpoken(gen); }); }

    // ----- Conversation.Listener -----
    @Override public void onState(Conversation.State s, String detail) {
        Hub.state(s.name(), detail);
        if (s == Conversation.State.ERROR) main.post(() -> stopSession(null));
    }
    @Override public void onReply(String q, Dialogue.Reply r) { Hub.reply(q, r.display, r.citation, r.kind.name()); }

    private Notification notification() {
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pOpen = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
        PendingIntent pStop = PendingIntent.getService(this, 1, new Intent(this, VoiceService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_neu205)
                .setContentTitle("NEU205 is listening")
                .setContentText("Ask your question. Tap Stop to end.")
                .setContentIntent(pOpen)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(null, "Stop", pStop).build())
                .build();
    }

    static void start(Context ctx, long tapAt) {
        ctx.startForegroundService(new Intent(ctx, VoiceService.class).setAction(ACTION_START).putExtra("tapAt", tapAt));
    }

    static void stop(Context ctx) {
        ctx.startService(new Intent(ctx, VoiceService.class).setAction(ACTION_STOP));
    }

    @Override public void onDestroy() {
        wantRunning = false;
        if (conv != null) conv.stop();
        mic.stop();
        speaker.shutdown();
        asr.shutdownNow();
        prep.shutdownNow();
        super.onDestroy();
    }
}
