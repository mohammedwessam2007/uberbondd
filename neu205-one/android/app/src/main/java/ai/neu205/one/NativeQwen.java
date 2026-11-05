package ai.neu205.one;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** One model/context. Callers must verify the exact open GGUF before construction. */
public final class NativeQwen implements AutoCloseable {
    static { System.loadLibrary("neu205_qwen"); }
    public interface Tokens { void token(byte[] utf8); }
    private final Object lifetime = new Object();
    private long handle;
    private volatile boolean cancelled;

    public NativeQwen(String verifiedPath, int threads) throws IOException {
        handle = create(verifiedPath, Math.max(1, Math.min(threads, 4)));
        if (handle == 0) throw new IOException("Native Qwen could not load the verified model");
    }
    /** Arm before handing work to a worker; cancellation after this point is never cleared by run. */
    public synchronized void prepare() { synchronized (lifetime) { cancelled = false; if(handle != 0) resetCancel(handle); } }
    public synchronized int tokens(String prompt) throws IOException {
        if(handle==0)throw new IOException("Native Qwen is closed");
        return countTokens(handle,prompt.getBytes(StandardCharsets.UTF_8));
    }
    public synchronized void answer(String prompt, Tokens tokens) throws IOException {
        if (cancelled) return;
        long h; synchronized (lifetime) { h = handle; }
        if (h == 0) throw new IOException("Native Qwen is closed");
        int result = generate(h, prompt.getBytes(StandardCharsets.UTF_8), 180,
                bytes -> { synchronized(lifetime){if (!cancelled) tokens.token(bytes);} });
        if (result != 0 && !cancelled) throw new IOException("Native Qwen inference failed (" + result + ")");
    }
    public void cancel() { synchronized (lifetime) { cancelled = true; if (handle != 0) abort(handle); } }
    public int stage() { synchronized(lifetime){return handle==0?0:phase(handle);} }
    @Override public synchronized void close() {
        synchronized (lifetime) { cancelled = true; if (handle != 0) { destroy(handle); handle = 0; } }
    }
    private static native long create(String path, int threads);
    private static native int generate(long handle, byte[] prompt, int maxTokens, Tokens callback);
    private static native void abort(long handle);
    private static native void resetCancel(long handle);
    private static native void destroy(long handle);
    private static native int countTokens(long handle, byte[] prompt);
    private static native int phase(long handle);
}
