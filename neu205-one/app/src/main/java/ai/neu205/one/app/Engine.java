package ai.neu205.one.app;

import ai.neu205.one.core.KnowledgeBase;
import ai.neu205.one.core.audio.WhisperTokens;
import android.content.Context;
import android.content.res.AssetManager;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Properties;

/**
 * Process-wide warm engine: study pack + Whisper sessions are loaded once (first launch shows
 * "Preparing") and stay warm across Start/Stop so later Starts are immediate. Models are copied
 * from the APK into private app storage once, atomically (tmp + rename), and verified by size.
 */
final class Engine {
    private static volatile Engine instance;
    private static final Object LOCK = new Object();

    final KnowledgeBase kb;
    final WhisperOnnx whisper;
    final long kbLoadMs;
    final String modelName;

    private Engine(KnowledgeBase kb, WhisperOnnx w, long kbMs, String modelName) {
        this.kb = kb; this.whisper = w; this.kbLoadMs = kbMs; this.modelName = modelName;
    }

    static Engine peek() { return instance; }

    /** Blocking; call off the main thread. Throws with a human-readable message on failure. */
    static Engine get(Context ctx) throws Exception {
        Engine e = instance;
        if (e != null) return e;
        synchronized (LOCK) {
            if (instance != null) return instance;
            Context app = ctx.getApplicationContext();
            AssetManager am = app.getAssets();
            long t0 = System.nanoTime();
            KnowledgeBase kb;
            try (InputStream in = am.open("kb/kb.json")) {
                kb = KnowledgeBase.fromJson(new String(readAll(in), StandardCharsets.UTF_8));
            } catch (IOException io) {
                throw new IllegalStateException("Study pack missing from this build");
            }
            long kbMs = (System.nanoTime() - t0) / 1_000_000;
            Properties cfg = new Properties();
            try (InputStream in = am.open("models/whisper/config.properties")) { cfg.load(in); }
            File dir = new File(app.getFilesDir(), "models/whisper-" + cfg.getProperty("id"));
            File enc = install(am, "models/whisper/encoder.onnx", new File(dir, "encoder.onnx"),
                    Long.parseLong(cfg.getProperty("encoder_bytes")), cfg.getProperty("encoder_sha256"));
            File dec = install(am, "models/whisper/decoder.onnx", new File(dir, "decoder.onnx"),
                    Long.parseLong(cfg.getProperty("decoder_bytes")), cfg.getProperty("decoder_sha256"));
            List<String> toks;
            try (InputStream in = am.open("models/whisper/tokens.txt")) {
                toks = Arrays.asList(new String(readAll(in), StandardCharsets.UTF_8).split("\n", -1));
            }
            List<Integer> sup = new ArrayList<>();
            for (String s : cfg.getProperty("suppress").split(",")) if (!s.trim().isEmpty()) sup.add(Integer.parseInt(s.trim()));
            int[] suppress = new int[sup.size()];
            for (int i = 0; i < suppress.length; i++) suppress[i] = sup.get(i);
            int threads = Math.max(2, Math.min(6, Runtime.getRuntime().availableProcessors() - 2));
            WhisperOnnx w = new WhisperOnnx(enc.getAbsolutePath(), dec.getAbsolutePath(), new WhisperTokens(toks),
                    Integer.parseInt(cfg.getProperty("layers")), Integer.parseInt(cfg.getProperty("heads")),
                    Integer.parseInt(cfg.getProperty("head_dim")), suppress, threads);
            // Warm-up decode on silence so the first real question does not pay JIT/allocator cost.
            w.transcribe(new float[16000]);
            instance = new Engine(kb, w, kbMs, cfg.getProperty("id") + " threads=" + threads);
            return instance;
        }
    }

    /**
     * Copy a model out of the APK once and verify its SHA-256 against the build manifest.
     * A ".verified" marker (holding the digest) avoids re-hashing 250 MB on every launch; any size
     * mismatch, missing marker or digest mismatch forces a fresh copy + verification.
     */
    private static File install(AssetManager am, String asset, File dst, long expectedBytes, String expectedSha) throws IOException {
        if (expectedSha == null || expectedSha.length() != 64) throw new IOException("Build is missing a model checksum");
        File marker = new File(dst.getPath() + ".verified");
        if (dst.isFile() && dst.length() == expectedBytes && marker.isFile()
                && expectedSha.equals(new String(readAll(new java.io.FileInputStream(marker)), StandardCharsets.UTF_8).trim())) {
            return dst;
        }
        marker.delete();
        File parent = dst.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new IOException("Cannot create model folder");
        File tmp = new File(dst.getPath() + ".tmp");
        java.security.MessageDigest md;
        try { md = java.security.MessageDigest.getInstance("SHA-256"); } catch (java.security.NoSuchAlgorithmException e) { throw new IOException(e); }
        try (InputStream in = am.open(asset); OutputStream out = new FileOutputStream(tmp)) {
            byte[] buf = new byte[1 << 20];
            int r;
            while ((r = in.read(buf)) > 0) { out.write(buf, 0, r); md.update(buf, 0, r); }
        }
        String got = hex(md.digest());
        if (tmp.length() != expectedBytes) { tmp.delete(); throw new IOException("Model copy incomplete (storage full?)"); }
        if (!got.equals(expectedSha)) { tmp.delete(); throw new IOException("Model file is corrupted (checksum mismatch)"); }
        if (!tmp.renameTo(dst)) throw new IOException("Model install failed");
        try (OutputStream m = new FileOutputStream(marker)) { m.write(got.getBytes(StandardCharsets.UTF_8)); }
        return dst;
    }

    static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x & 0xff));
        return s.toString();
    }

    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[1 << 16];
        int r;
        while ((r = in.read(buf)) > 0) b.write(buf, 0, r);
        return b.toByteArray();
    }
}
