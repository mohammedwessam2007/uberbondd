package ai.neu205.one.core;

import ai.neu205.one.core.audio.LogMel;
import ai.neu205.one.core.audio.UtteranceSegmenter;
import ai.neu205.one.core.audio.WhisperTokens;
import java.io.DataOutputStream;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Random;

/** AudioTests mel <wav> <out.f32> | seg <wav...> | tok <tokens.txt> <id,id,...> */
public final class AudioTests {
    static short[] readWav16(String p) throws Exception {
        byte[] b = Files.readAllBytes(Paths.get(p));
        int off = 12;
        while (!(b[off] == 'd' && b[off + 1] == 'a' && b[off + 2] == 't' && b[off + 3] == 'a')) {
            int sz = ByteBuffer.wrap(b, off + 4, 4).order(ByteOrder.LITTLE_ENDIAN).getInt();
            off += 8 + sz;
        }
        int n = ByteBuffer.wrap(b, off + 4, 4).order(ByteOrder.LITTLE_ENDIAN).getInt() / 2;
        short[] s = new short[n];
        ByteBuffer.wrap(b, off + 8, n * 2).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(s);
        return s;
    }

    public static void main(String[] a) throws Exception {
        switch (a[0]) {
            case "mel": {
                short[] s = readWav16(a[1]);
                float[] f = new float[s.length];
                for (int i = 0; i < s.length; i++) f[i] = s[i] / 32768f;
                int frames = LogMel.framesFor(f.length);
                long t0 = System.nanoTime();
                float[] m = LogMel.compute(f, frames);
                System.out.printf("frames=%d ms=%.1f%n", frames, (System.nanoTime() - t0) / 1e6);
                try (DataOutputStream o = new DataOutputStream(new FileOutputStream(a[2]))) {
                    ByteBuffer bb = ByteBuffer.allocate(m.length * 4).order(ByteOrder.LITTLE_ENDIAN);
                    for (float x : m) bb.putFloat(x);
                    o.write(bb.array());
                }
                break;
            }
            case "seg": {
                int ok = 0;
                Random r = new Random(7);
                for (int k = 1; k < a.length; k++) {
                    short[] speech = readWav16(a[k]);
                    // 1 s low noise, speech, 1.5 s low noise (deterministic)
                    short[] all = new short[16000 + speech.length + 24000];
                    for (int i = 0; i < all.length; i++) all[i] = (short) (r.nextGaussian() * 30);
                    for (int i = 0; i < speech.length; i++) all[16000 + i] += speech[i];
                    UtteranceSegmenter seg = new UtteranceSegmenter();
                    int utts = 0; int len = 0;
                    for (int i = 0; i + 320 <= all.length; i += 320) {
                        short[] fr = new short[320];
                        System.arraycopy(all, i, fr, 0, 320);
                        UtteranceSegmenter.Result res = seg.accept(fr);
                        if (res != null && res.pcm != null) { utts++; len = res.pcm.length; }
                    }
                    boolean good = utts == 1 && len >= speech.length * 0.8;
                    ok += good ? 1 : 0;
                    System.out.printf("%s %s utterances=%d samples=%d speech=%d%n", good ? "PASS" : "FAIL", a[k], utts, len, speech.length);
                }
                System.out.printf("SEG %d/%d%n", ok, a.length - 1);
                break;
            }
            case "tok": {
                WhisperTokens t = new WhisperTokens(Files.readAllLines(Paths.get(a[1]), StandardCharsets.UTF_8));
                String[] p = a[2].split(",");
                int[] ids = new int[p.length];
                for (int i = 0; i < p.length; i++) ids[i] = Integer.parseInt(p[i]);
                System.out.println("DECODED:" + t.decode(ids, ids.length));
                break;
            }
            default: throw new IllegalArgumentException(a[0]);
        }
    }
}
