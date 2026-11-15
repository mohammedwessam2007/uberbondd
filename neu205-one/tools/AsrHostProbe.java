package ai.neu205.one;

import ai.neu205.one.core.audio.WhisperTokens;
import java.nio.*;
import java.nio.file.*;
import java.util.*;

/** Runs the actual application ASR decoder with Linux ONNX Runtime, not an Android/phone claim. */
public final class AsrHostProbe {
    public static void main(String[] args) throws Exception {
        Path assets = Path.of(args[0]);
        Properties cfg = new Properties();
        try (var in = Files.newInputStream(assets.resolve("config.properties"))) { cfg.load(in); }
        int[] suppress = Arrays.stream(cfg.getProperty("suppress").split(",")).map(String::trim).mapToInt(Integer::parseInt).toArray();
        long cold = System.nanoTime();
        try (WhisperOnnx model = new WhisperOnnx(assets.resolve("encoder.onnx").toString(),
                assets.resolve("decoder.onnx").toString(),
                new WhisperTokens(Arrays.asList(Files.readString(assets.resolve("tokens.txt")).split("\n", -1))),
                Integer.parseInt(cfg.getProperty("layers")), Integer.parseInt(cfg.getProperty("heads")),
                Integer.parseInt(cfg.getProperty("headDim")), suppress, 4)) {
            String prompt = System.getProperty("neu205.prompt", "");
            if (!prompt.isEmpty()) model.setVocabularyPrompt(Arrays.stream(prompt.split(",")).mapToLong(Long::parseLong).toArray());
            System.out.println("HOST_JAVA_MODEL_LOAD_MS=" + (System.nanoTime() - cold) / 1_000_000);
            for (int file = 1; file < args.length; file++) {
                // Input is explicitly headerless signed PCM16 mono 16 kHz, generated privately.
                byte[] pcm = Files.readAllBytes(Path.of(args[file]));
                float[] audio = new float[pcm.length / 2];
                ByteBuffer data = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN);
                for (int i = 0; i < audio.length; i++) audio[i] = data.getShort() / 32768f;
                for (int repeat = 0; repeat < 5; repeat++) {
                    model.cancelled = false;
                    WhisperOnnx.Result r = model.transcribe(audio);
                    if (r == null || r.text.isBlank()) throw new AssertionError("No recognition for synthetic speech fixture");
                    System.out.println("HOST_JAVA_SYNTHETIC fixture=" + file + " repeat=" + repeat
                        + " total_ms=" + (r.melMs + r.encMs + r.decMs) + " mel_ms=" + r.melMs
                        + " encoder_ms=" + r.encMs + " decoder_ms=" + r.decMs + " tokens=" + r.nTokens);
                    // Synthetic probe text only; no owner audio or book passages.
                    System.out.println("SYNTHETIC_TRANSCRIPT=" + r.text.replace('\n', ' '));
                }
                model.cancelled = true;
                if (model.transcribe(audio) != null) throw new AssertionError("Cancelled decoder returned an answer");
                System.out.println("CANCELLED_DECODER_RESULT_WITHHELD=true");
                model.cancelled = false;
                final boolean[] stale = {false};
                final Throwable[] unexpected = {null};
                Thread inference = new Thread(() -> {
                    try { if (model.transcribe(audio) != null) stale[0] = true; }
                    catch (ai.onnxruntime.OrtException expected) {
                        if (!model.cancelled) unexpected[0] = expected;
                    } catch (Throwable error) { unexpected[0] = error; }
                });
                inference.start();
                Thread.sleep(100);
                long cancellation = System.nanoTime();
                model.cancelInference();
                inference.join(5000);
                if (inference.isAlive() || stale[0] || unexpected[0] != null)
                    throw new AssertionError("Native cancellation failed", unexpected[0]);
                System.out.println("NATIVE_CANCEL_JOIN_MS=" + (System.nanoTime() - cancellation) / 1_000_000);
            }
        }
        System.out.println("PHONE_TESTED=false");
    }
}
