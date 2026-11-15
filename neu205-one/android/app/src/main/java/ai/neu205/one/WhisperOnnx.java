package ai.neu205.one;

import ai.neu205.one.core.audio.LogMel;
import ai.neu205.one.core.audio.WhisperTokens;
import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OnnxValue;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * On-device Whisper (HF/transformers.js ONNX export, q8) via ONNX Runtime CPU. Same algorithm
 * as tools/whisper_host.py, which produced the host benchmark: shortened encoder window
 * (patched positional slice), KV-cached greedy decode, special-token suppression, repetition
 * guard. Cancellation is checked between decoder steps.
 */
final class WhisperOnnx implements AutoCloseable {
    private final OrtEnvironment env = OrtEnvironment.getEnvironment();
    private final OrtSession encoder, decoder;
    private final WhisperTokens tokens;
    private final int layers, heads, headDim;
    private final int[] suppress;
    private final String encOut;
    final long loadMs;
    private long[] vocabularyPrompt=new long[0];
    synchronized void setVocabularyPrompt(long[] ids){if(ids==null || ids.length>224)throw new IllegalArgumentException("prompt budget");for(long id:ids)if(id<0 || id>50364)throw new IllegalArgumentException("prompt token");vocabularyPrompt=ids.clone();}
    volatile boolean cancelled;
    private final Object runLock=new Object();
    private OrtSession.RunOptions activeRun;
    void cancelInference(){synchronized(runLock){cancelled=true;if(activeRun!=null)try{activeRun.setTerminate(true);}catch(OrtException ignored){}}}

    WhisperOnnx(String encoderPath, String decoderPath, WhisperTokens tokens, int layers, int heads, int headDim,
                int[] suppress, int threads) throws OrtException {
        env.setTelemetry(false);
        long t0 = System.nanoTime();
        OrtSession.SessionOptions so = new OrtSession.SessionOptions();
        so.setIntraOpNumThreads(threads);
        so.setInterOpNumThreads(1);
        so.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        encoder = env.createSession(encoderPath, so);
        try { decoder = env.createSession(decoderPath, so); } catch (OrtException e) { encoder.close(); throw e; } finally { so.close(); }
        this.tokens = tokens; this.layers = layers; this.heads = heads; this.headDim = headDim; this.suppress = suppress;
        encOut = encoder.getOutputNames().iterator().next();
        loadMs = (System.nanoTime() - t0) / 1_000_000;
    }

    static final class Result {
        final String text; final long melMs, encMs, decMs; final int nTokens;
        Result(String text, long melMs, long encMs, long decMs, int nTokens) {
            this.text = text; this.melMs = melMs; this.encMs = encMs; this.decMs = decMs; this.nTokens = nTokens;
        }
    }

    synchronized Result transcribe(float[] audio) throws OrtException {
        try(OrtSession.RunOptions options=new OrtSession.RunOptions()){
            synchronized(runLock){if(cancelled)return null;activeRun=options;}
            try{return transcribeInternal(audio,options);}
            finally{synchronized(runLock){activeRun=null;}}
        }
    }
    private Result transcribeInternal(float[] audio,OrtSession.RunOptions options) throws OrtException {
        if(cancelled) return null;
        long t0 = System.nanoTime();
        int frames = LogMel.framesFor(audio.length);
        float[] mel = LogMel.compute(audio, frames);
        long t1 = System.nanoTime();
        int[] out = new int[96];
        int n = 0;
        try (OnnxTensor feats = OnnxTensor.createTensor(env, FloatBuffer.wrap(mel), new long[]{1, LogMel.N_MELS, frames});
             OrtSession.Result encRes = encoder.run(java.util.Collections.singletonMap("input_features", feats), java.util.Collections.singleton(encOut), options)) {
            OnnxTensor hs = (OnnxTensor) encRes.get(encOut).get();
            long t2 = System.nanoTime();
            long[] prompt=java.util.Arrays.copyOf(vocabularyPrompt,vocabularyPrompt.length+4);int p=vocabularyPrompt.length;prompt[p]=WhisperTokens.SOT;prompt[p+1]=WhisperTokens.EN;prompt[p+2]=WhisperTokens.TRANSCRIBE;prompt[p+3]=WhisperTokens.NO_TIMESTAMPS;
            Map<String, OnnxTensor> owned = new HashMap<>();
            OrtSession.Result first = null, prev = null;
            try {
                OnnxTensor empty = OnnxTensor.createTensor(env, FloatBuffer.allocate(0), new long[]{1, heads, 0, headDim});
                owned.put("empty", empty);
                OnnxTensor ids = OnnxTensor.createTensor(env, LongBuffer.wrap(prompt), new long[]{1, prompt.length});
                owned.put("ids0", ids);
                OnnxTensor noCache = OnnxTensor.createTensor(env, new boolean[]{false});
                OnnxTensor useCache = OnnxTensor.createTensor(env, new boolean[]{true});
                owned.put("nc", noCache); owned.put("uc", useCache);
                Map<String, OnnxTensor> feed = new HashMap<>();
                feed.put("input_ids", ids);
                feed.put("encoder_hidden_states", hs);
                feed.put("use_cache_branch", noCache);
                for (int i = 0; i < layers; i++) {
                    feed.put("past_key_values." + i + ".decoder.key", empty);
                    feed.put("past_key_values." + i + ".decoder.value", empty);
                    feed.put("past_key_values." + i + ".encoder.key", empty);
                    feed.put("past_key_values." + i + ".encoder.value", empty);
                }
                for (int step = 0; step < out.length; step++) {
                    if (cancelled) return null;
                    OrtSession.Result res = decoder.run(feed,options);
                    if (first == null) first = res;
                    if (prev != null && prev != first) prev.close();
                    prev = res;
                    int next = argmax((OnnxTensor) res.get("logits").get(), step == 0);
                    if (next == WhisperTokens.EOT) break;
                    out[n++] = next;
                    if (n >= 8 && repetitive(out, n)) break;
                    OnnxTensor nid = OnnxTensor.createTensor(env, LongBuffer.wrap(new long[]{next}), new long[]{1, 1});
                    OnnxTensor old = owned.put("ids", nid);
                    if (old != null) old.close();
                    feed.put("input_ids", nid);
                    feed.put("use_cache_branch", useCache);
                    for (int i = 0; i < layers; i++) {
                        feed.put("past_key_values." + i + ".decoder.key", tensor(res, "present." + i + ".decoder.key"));
                        feed.put("past_key_values." + i + ".decoder.value", tensor(res, "present." + i + ".decoder.value"));
                        feed.put("past_key_values." + i + ".encoder.key", tensor(first, "present." + i + ".encoder.key"));
                        feed.put("past_key_values." + i + ".encoder.value", tensor(first, "present." + i + ".encoder.value"));
                    }
                }
            } finally {
                if (prev != null && prev != first) prev.close();
                if (first != null) first.close();
                for (OnnxTensor t : owned.values()) t.close();
            }
            long t3 = System.nanoTime();
            return new Result(tokens.decode(out, n), (t1 - t0) / 1_000_000, (t2 - t1) / 1_000_000, (t3 - t2) / 1_000_000, n);
        }
    }

    private static OnnxTensor tensor(OrtSession.Result r, String name) {
        Optional<OnnxValue> v = r.get(name);
        if (!v.isPresent()) throw new IllegalStateException("missing output " + name);
        return (OnnxTensor) v.get();
    }

    private int argmax(OnnxTensor logits, boolean firstStep) {
        long[] shape = logits.getInfo().getShape();
        int vocab = (int) shape[2];
        int seq = (int) shape[1];
        FloatBuffer fb = logits.getFloatBuffer();
        int base = (seq - 1) * vocab;
        float[] row = new float[vocab];
        fb.position(base);
        fb.get(row, 0, vocab);
        for (int s : suppress) if (s < vocab) row[s] = Float.NEGATIVE_INFINITY;
        for (int i = WhisperTokens.EOT + 1; i < vocab; i++) row[i] = Float.NEGATIVE_INFINITY; // no specials but EOT
        if (firstStep) { row[220] = Float.NEGATIVE_INFINITY; row[WhisperTokens.EOT] = Float.NEGATIVE_INFINITY; }
        int best = 0;
        for (int i = 1; i < vocab; i++) if (row[i] > row[best]) best = i;
        return best;
    }

    private static boolean repetitive(int[] t, int n) {
        java.util.HashSet<Integer> s = new java.util.HashSet<>();
        for (int i = n - 8; i < n; i++) s.add(t[i]);
        return s.size() <= 2;
    }

    @Override public synchronized void close() throws OrtException { encoder.close(); decoder.close(); }
}
