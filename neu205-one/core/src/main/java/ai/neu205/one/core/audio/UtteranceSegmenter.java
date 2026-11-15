package ai.neu205.one.core.audio;

import java.util.ArrayDeque;
import java.util.Arrays;

/**
 * Adaptive energy endpointing, ported from the v8 donor (ai.neu205.pocket.UtteranceSegmenter,
 * whose synthetic low-amplitude endpoint fix is preserved). 20 ms frames at 16 kHz; 400 ms
 * calibration; 300 ms pre-roll; hysteresis keeps quiet trailing words; overlong speech is
 * drained and dropped (never half-transcribed). Output is float PCM in [-1, 1].
 * NOT a validated speech/noise classifier: real-phone false-trigger/miss rates are UNKNOWN.
 */
public final class UtteranceSegmenter {
    public static final int FRAME = 320;
    private final int endFrames, maxFrames;
    private final double[] calibration = new double[20];
    private int calibrated, onset, quiet, frames, voiced;
    private boolean utterance, discarding;
    private double noise = 8, rms;
    private short[] buf = new short[16000 * 4];
    private int len;
    private final ArrayDeque<short[]> pre = new ArrayDeque<>();

    public UtteranceSegmenter() { this(600, 15000); }

    public UtteranceSegmenter(int silenceMs, int maxMs) {
        if (silenceMs < 200 || silenceMs > 1200) throw new IllegalArgumentException("silence 200-1200 ms");
        endFrames = (silenceMs + 19) / 20;
        maxFrames = maxMs / 20;
    }

    public static final class Result {
        public final float[] pcm; public final boolean tooLong;
        Result(float[] pcm, boolean tooLong) { this.pcm = pcm; this.tooLong = tooLong; }
    }

    public boolean isCalibrated() { return calibrated >= 20; }
    public boolean inSpeech() { return utterance || discarding; }
    public double rms() { return rms; }
    public double noise() { return noise; }

    public void reset() {
        onset = quiet = frames = voiced = 0; utterance = discarding = false; len = 0; pre.clear();
    }

    /** Feed exactly one 20 ms frame. Returns a complete utterance, a too-long notice, or null. */
    public Result accept(short[] samples) {
        if (samples.length != FRAME) throw new IllegalArgumentException("Expected 20 ms frame");
        double sum = 0;
        for (short s : samples) sum += (double) s * s;
        rms = Math.sqrt(sum / FRAME);
        if (!isCalibrated()) {
            calibration[calibrated++] = rms;
            if (isCalibrated()) {
                double[] sorted = calibration.clone();
                Arrays.sort(sorted);
                noise = Math.max(2, sorted[5]); // lower quartile resists brief transients
            }
            return null;
        }
        double threshold = Math.max(utterance || discarding ? 8 : 10, noise * (utterance || discarding ? 1.35 : 1.9) + 3);
        boolean speech = rms > threshold;
        if (discarding) {
            quiet = speech ? 0 : quiet + 1;
            if (quiet >= endFrames) { reset(); return new Result(null, true); }
            return null;
        }
        if (!utterance) {
            if (!speech) noise = noise * .98 + Math.min(rms, noise * 1.2 + 1) * .02; // bounded baseline drift
            pre.addLast(samples.clone());
            while (pre.size() > 15) pre.removeFirst();
            onset = speech ? onset + 1 : 0;
            if (onset >= 3) {
                utterance = true; frames = onset; voiced = onset; quiet = 0;
                while (!pre.isEmpty()) append(pre.removeFirst());
            }
            return null;
        }
        append(samples);
        frames++;
        if (speech) { quiet = 0; voiced++; } else quiet++;
        if (frames >= maxFrames) { len = 0; pre.clear(); utterance = false; discarding = true; quiet = 0; return null; }
        if (quiet >= endFrames) {
            float[] out = null;
            if (voiced >= 9) {
                out = new float[len];
                for (int i = 0; i < len; i++) out[i] = buf[i] / 32768f;
            }
            reset();
            return out == null ? null : new Result(out, false);
        }
        return null;
    }

    private void append(short[] s) {
        if (len + s.length > buf.length) buf = Arrays.copyOf(buf, buf.length * 2);
        System.arraycopy(s, 0, buf, len, s.length);
        len += s.length;
    }
}
