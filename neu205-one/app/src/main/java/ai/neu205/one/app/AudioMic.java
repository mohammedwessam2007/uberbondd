package ai.neu205.one.app;

import ai.neu205.one.core.Conversation;
import ai.neu205.one.core.audio.UtteranceSegmenter;
import android.annotation.SuppressLint;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;

/**
 * Phone-microphone capture at 16 kHz mono. Audio never leaves memory and is never written to
 * storage. Half-duplex: while muted (assistant speaking) frames are discarded, and after unmute a
 * tail of TAIL_MS is also discarded so the end of our own speech is not transcribed.
 */
final class AudioMic implements Conversation.Mic {
    interface Sink {
        void onUtterance(int gen, float[] pcm);
        void onMicFailure(int gen, String why);
        void onLevel(double rms, double noise, boolean inSpeech);
    }

    static final int TAIL_MS = 350;
    private final Sink sink;
    private volatile boolean running, muted;
    private volatile long unmuteAtMs;
    private Thread thread;
    private AudioRecord record;
    private AcousticEchoCanceler aec;
    private NoiseSuppressor ns;
    volatile String routeInfo = "unknown";

    AudioMic(Sink sink) { this.sink = sink; }

    @SuppressLint("MissingPermission") // caller checks RECORD_AUDIO before Start
    @Override public synchronized boolean start(int gen) {
        stop();
        int min = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        try {
            record = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(min, 16000 * 2));
        } catch (RuntimeException e) {
            return false;
        }
        if (record.getState() != AudioRecord.STATE_INITIALIZED) { record.release(); record = null; return false; }
        int sid = record.getAudioSessionId();
        if (AcousticEchoCanceler.isAvailable()) { aec = AcousticEchoCanceler.create(sid); if (aec != null) aec.setEnabled(true); }
        if (NoiseSuppressor.isAvailable()) { ns = NoiseSuppressor.create(sid); if (ns != null) ns.setEnabled(true); }
        try { record.startRecording(); } catch (RuntimeException e) { release(); return false; }
        if (record.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) { release(); return false; }
        routeInfo = (record.getRoutedDevice() == null ? "default" : record.getRoutedDevice().getProductName() + " type " + record.getRoutedDevice().getType())
                + (aec != null ? " +AEC" : "") + (ns != null ? " +NS" : "");
        running = true;
        muted = false;
        final AudioRecord rec = record;
        thread = new Thread(() -> loop(gen, rec), "neu205-mic");
        thread.setPriority(Thread.MAX_PRIORITY);
        thread.start();
        return true;
    }

    private void loop(int gen, AudioRecord rec) {
        UtteranceSegmenter seg = new UtteranceSegmenter(600, 15000);
        short[] frame = new short[UtteranceSegmenter.FRAME];
        int level = 0;
        while (running) {
            int got = 0;
            while (got < frame.length && running) {
                int r = rec.read(frame, got, frame.length - got);
                if (r < 0) { if (running) sink.onMicFailure(gen, "Microphone read failed (" + r + ")"); return; }
                got += r;
            }
            if (!running) return;
            if (muted || System.currentTimeMillis() < unmuteAtMs) { seg.reset(); continue; }
            UtteranceSegmenter.Result res = seg.accept(frame);
            if (++level % 5 == 0) sink.onLevel(seg.rms(), seg.noise(), seg.inSpeech());
            if (res != null && res.pcm != null) sink.onUtterance(gen, res.pcm);
        }
    }

    @Override public void setMuted(boolean m) {
        if (!m && muted) unmuteAtMs = System.currentTimeMillis() + TAIL_MS;
        muted = m;
    }

    @Override public synchronized void stop() {
        running = false;
        if (record != null) {
            try { record.stop(); } catch (RuntimeException ignored) { }
        }
        if (thread != null) { try { thread.join(500); } catch (InterruptedException ignored) { } thread = null; }
        release();
    }

    private void release() {
        if (aec != null) { aec.release(); aec = null; }
        if (ns != null) { ns.release(); ns = null; }
        if (record != null) { record.release(); record = null; }
    }
}
