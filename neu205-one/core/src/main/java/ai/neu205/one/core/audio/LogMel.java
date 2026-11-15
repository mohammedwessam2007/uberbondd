package ai.neu205.one.core.audio;

/**
 * Whisper log-mel front end (n_fft=400, hop=160, 80 Slaney mels, periodic Hann, reflect
 * padding, last frame dropped, log10 clamp to max-8, (x+4)/4). Mirrors tools/whisper_host.py
 * exactly; parity is checked by tools/test_mel_parity.sh. Direct DFT with precomputed
 * tables (n_fft=400 is not a power of two).
 */
public final class LogMel {
    public static final int SR = 16000, N_FFT = 400, HOP = 160, N_MELS = 80, BINS = N_FFT / 2 + 1;
    private static final float[] WIN = new float[N_FFT];
    private static final float[] COS = new float[BINS * N_FFT], SIN = new float[BINS * N_FFT];
    private static final float[][] FILTERS = melFilters();

    static {
        for (int i = 0; i < N_FFT; i++) WIN[i] = (float) (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N_FFT));
        for (int k = 0; k < BINS; k++)
            for (int n = 0; n < N_FFT; n++) {
                double a = 2 * Math.PI * k * n / N_FFT;
                COS[k * N_FFT + n] = (float) Math.cos(a);
                SIN[k * N_FFT + n] = (float) Math.sin(a);
            }
    }

    private LogMel() {}

    static double hzToMel(double f) {
        double fsp = 200.0 / 3, minLogHz = 1000.0, minLogMel = minLogHz / fsp, logstep = Math.log(6.4) / 27.0;
        return f >= minLogHz ? minLogMel + Math.log(f / minLogHz) / logstep : f / fsp;
    }

    static double melToHz(double m) {
        double fsp = 200.0 / 3, minLogHz = 1000.0, minLogMel = minLogHz / fsp, logstep = Math.log(6.4) / 27.0;
        return m >= minLogMel ? minLogHz * Math.exp(logstep * (m - minLogMel)) : fsp * m;
    }

    static float[][] melFilters() {
        double[] fft = new double[BINS];
        for (int i = 0; i < BINS; i++) fft[i] = (SR / 2.0) * i / (BINS - 1);
        double lo = hzToMel(0), hi = hzToMel(SR / 2.0);
        double[] melF = new double[N_MELS + 2];
        for (int i = 0; i < N_MELS + 2; i++) melF[i] = melToHz(lo + (hi - lo) * i / (N_MELS + 1));
        float[][] w = new float[N_MELS][BINS];
        for (int m = 0; m < N_MELS; m++) {
            double d0 = melF[m + 1] - melF[m], d1 = melF[m + 2] - melF[m + 1];
            double enorm = 2.0 / (melF[m + 2] - melF[m]);
            for (int b = 0; b < BINS; b++) {
                double lower = -(melF[m] - fft[b]) / d0;
                double upper = (melF[m + 2] - fft[b]) / d1;
                w[m][b] = (float) (Math.max(0, Math.min(lower, upper)) * enorm);
            }
        }
        return w;
    }

    /** Returns features laid out [80][nFrames] flattened row-major (ORT input [1,80,nFrames]). */
    public static float[] compute(float[] audio, int nFrames) {
        int nSamples = nFrames * HOP, pad = N_FFT / 2;
        float[] a = new float[nSamples];
        System.arraycopy(audio, 0, a, 0, Math.min(audio.length, nSamples));
        float[] x = new float[nSamples + 2 * pad];
        for (int i = 0; i < x.length; i++) {
            int j = i - pad;
            if (j < 0) j = -j;                         // reflect (no edge repeat)
            if (j >= nSamples) j = 2 * (nSamples - 1) - j;
            x[i] = a[j];
        }
        float[] out = new float[N_MELS * nFrames];
        float[] frame = new float[N_FFT];
        double[] power = new double[BINS];
        double maxLog = -1e30;
        for (int f = 0; f < nFrames; f++) {
            int off = f * HOP;
            for (int n = 0; n < N_FFT; n++) frame[n] = x[off + n] * WIN[n];
            for (int k = 0; k < BINS; k++) {
                double re = 0, im = 0;
                int base = k * N_FFT;
                for (int n = 0; n < N_FFT; n++) { re += frame[n] * COS[base + n]; im += frame[n] * SIN[base + n]; }
                power[k] = re * re + im * im;
            }
            for (int m = 0; m < N_MELS; m++) {
                double s = 0;
                float[] fl = FILTERS[m];
                for (int k = 0; k < BINS; k++) s += fl[k] * power[k];
                double lg = Math.log10(Math.max(s, 1e-10));
                out[m * nFrames + f] = (float) lg;
                if (lg > maxLog) maxLog = lg;
            }
        }
        double floor = maxLog - 8.0;
        for (int i = 0; i < out.length; i++) out[i] = (float) ((Math.max(out[i], floor) + 4.0) / 4.0);
        return out;
    }

    /** Encoder window used on device: max(8 s, utterance + 1 s), capped at 30 s, even frame count. */
    public static int framesFor(int nSamples) {
        double s = Math.min(30.0, Math.max(8.0, nSamples / (double) SR + 1.0));
        int f = (int) Math.round(s * 100);
        return f - (f % 2);
    }
}
