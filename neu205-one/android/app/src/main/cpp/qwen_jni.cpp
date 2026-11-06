#include <jni.h>
#include "llama.h"
#include <atomic>
#include <algorithm>
#include <memory>
#include <mutex>
#include <string>
#include <vector>
#include <chrono>
#include <array>

namespace {
using Clock = std::chrono::steady_clock;
long long micros(Clock::time_point start) { return std::chrono::duration_cast<std::chrono::microseconds>(Clock::now()-start).count(); }
struct Engine {
    llama_model *model = nullptr;
    llama_context *ctx = nullptr;
    // Accessed only under NativeQwen's synchronized answer/timings lifetime.
    std::array<jlong,8> timing{}; // tokenize, prefill, decode, first-byte, total us; input/output tokens; callbacks us
    std::atomic<bool> cancelled{false};
    std::atomic<int> stage{0};
    ~Engine() { if(ctx) llama_free(ctx); if(model) llama_model_free(model); }
};
bool stopped(void *p) { return static_cast<Engine *>(p)->cancelled.load(); }
Engine *engine(jlong h) { return reinterpret_cast<Engine *>(h); }
std::once_flag init;
struct LoadProgress {
    JNIEnv *owner;
    JavaVM *vm=nullptr;
    jobject cancelled;
    jmethodID get;
    LoadProgress(JNIEnv *env,jobject flag):owner(env),cancelled(env->NewGlobalRef(flag)) {
        env->GetJavaVM(&vm);
        jclass cls=env->GetObjectClass(flag);
        get=env->GetMethodID(cls,"get","()Z");
        env->DeleteLocalRef(cls);
    }
    ~LoadProgress(){if(cancelled)owner->DeleteGlobalRef(cancelled);}
};
bool loading(float,void *data){
    auto *p=static_cast<LoadProgress *>(data);
    JNIEnv *env=nullptr;bool attached=false;
    jint status=p->vm->GetEnv(reinterpret_cast<void **>(&env),JNI_VERSION_1_6);
    if(status==JNI_EDETACHED){
#ifdef __ANDROID__
        if(p->vm->AttachCurrentThread(&env,nullptr)!=JNI_OK)return false;
#else
        if(p->vm->AttachCurrentThread(reinterpret_cast<void **>(&env),nullptr)!=JNI_OK)return false;
#endif
        attached=true;
    }else if(status!=JNI_OK)return false;
    bool proceed=!env->CallBooleanMethod(p->cancelled,p->get);
    if(env->ExceptionCheck()){env->ExceptionClear();proceed=false;}
    if(attached)p->vm->DetachCurrentThread();
    return proceed;
}
}

extern "C" JNIEXPORT jlong JNICALL
Java_ai_neu205_one_NativeQwen_create(JNIEnv *env, jclass, jstring path, jint threads,jobject cancelled) {
    try {
        std::call_once(init, [] { llama_backend_init(); });
        auto e = std::make_unique<Engine>();
        const char *chars = env->GetStringUTFChars(path, nullptr);
        if(!chars) return 0;
        std::string file(chars); env->ReleaseStringUTFChars(path, chars);
        auto mp = llama_model_default_params(); mp.n_gpu_layers = 0;
        LoadProgress progress(env,cancelled);
        if(!progress.cancelled || !progress.get || env->ExceptionCheck())return 0;
        mp.progress_callback=loading;mp.progress_callback_user_data=&progress;
        e->model = llama_model_load_from_file(file.c_str(), mp);
        if(!e->model) return 0;
        char arch[64] = {};
        if(llama_model_meta_val_str(e->model, "general.architecture", arch, sizeof(arch)) < 0 || std::string(arch) != "qwen35") return 0;
        auto cp = llama_context_default_params();
        cp.n_ctx = 2048; cp.n_batch = 64; cp.n_ubatch = 64;
        cp.n_threads = cp.n_threads_batch = std::clamp(int(threads), 1, 4);
        cp.abort_callback = stopped; cp.abort_callback_data = e.get();
        e->ctx = llama_init_from_model(e->model, cp);
        return e->ctx ? reinterpret_cast<jlong>(e.release()) : 0;
    } catch (...) { return 0; }
}

extern "C" JNIEXPORT void JNICALL Java_ai_neu205_one_NativeQwen_abort(JNIEnv *, jclass, jlong h) { engine(h)->cancelled.store(true); }
extern "C" JNIEXPORT void JNICALL Java_ai_neu205_one_NativeQwen_resetCancel(JNIEnv *, jclass, jlong h) { engine(h)->cancelled.store(false); }
extern "C" JNIEXPORT void JNICALL Java_ai_neu205_one_NativeQwen_destroy(JNIEnv *, jclass, jlong h) { delete engine(h); }
extern "C" JNIEXPORT jint JNICALL Java_ai_neu205_one_NativeQwen_phase(JNIEnv *, jclass, jlong h) { return engine(h)->stage.load(); }

extern "C" JNIEXPORT jint JNICALL Java_ai_neu205_one_NativeQwen_countTokens(JNIEnv *env, jclass, jlong h, jbyteArray input) {
    auto length=env->GetArrayLength(input);
    if(length<1 || length>65536) return -1;
    std::string text(length,'\0');
    env->GetByteArrayRegion(input,0,length,reinterpret_cast<jbyte *>(text.data()));
    if(env->ExceptionCheck()) return -1;
    int n=llama_tokenize(llama_model_get_vocab(engine(h)->model),text.data(),length,nullptr,0,true,true);
    return n<0 && n!=INT32_MIN ? -n : n;
}

extern "C" JNIEXPORT jint JNICALL
Java_ai_neu205_one_NativeQwen_generate(JNIEnv *env, jclass, jlong h, jbyteArray input, jint max_tokens, jobject callback) {
    try {
        auto *e = engine(h);
        e->timing.fill(0);e->timing[3]=-1;
        auto started=Clock::now();
        struct TimingReset { Engine *e; Clock::time_point start; ~TimingReset(){ e->timing[4]=micros(start); } } timingReset{e,started};
        struct StageReset { Engine *e; ~StageReset(){e->stage.store(0);} } reset{e};
        if(e->cancelled.load()) return 1;
        const auto length = env->GetArrayLength(input);
        if(length <= 0 || length > 65536 || max_tokens < 1 || max_tokens > 180) return -1;
        std::string prompt(length, '\0');
        env->GetByteArrayRegion(input, 0, length, reinterpret_cast<jbyte *>(prompt.data()));
        if(env->ExceptionCheck()) return -2;
        const auto *vocab = llama_model_get_vocab(e->model);
        std::vector<llama_token> tokens(2048);
        auto tokenizeStart=Clock::now();
        int n = llama_tokenize(vocab, prompt.data(), length, tokens.data(), tokens.size(), true, true);
        e->timing[0]=micros(tokenizeStart);
        e->timing[5]=n>0?n:0;
        if(n <= 0 || n + max_tokens + 32 > 2048) return -3;
        tokens.resize(n);
        auto prefillStart=Clock::now();
        struct PhaseTime { jlong &target; Clock::time_point start; ~PhaseTime(){target+=micros(start);} };
        { PhaseTime prefillTime{e->timing[1],prefillStart};
        llama_memory_clear(llama_get_memory(e->ctx), true);
        e->stage.store(1);
        for(size_t at = 0; at < tokens.size(); at += 64) {
            if(e->cancelled.load()) return 1;
            int count = std::min(size_t(64), tokens.size() - at);
            int rc = llama_decode(e->ctx, llama_batch_get_one(tokens.data() + at, count));
            if(rc != 0) return e->cancelled.load() ? 1 : -4;
        }
        } // prefill timer also records cancellation/error exits.
        // Greedy sampling is deterministic; it is a separately reconstructed candidate,
        // never represented as Claude's unavailable frozen configuration.
        std::unique_ptr<llama_sampler, decltype(&llama_sampler_free)> sampler(llama_sampler_init_greedy(), llama_sampler_free);
        jclass cls = env->GetObjectClass(callback);
        jmethodID emit = env->GetMethodID(cls, "token", "([B)V");
        env->DeleteLocalRef(cls);
        if(!emit) return -5;
        size_t emitted = 0;
        e->stage.store(2);
        for(int i = 0; i < max_tokens; ++i) {
            if(e->cancelled.load()) return 1;
            llama_token token = llama_sampler_sample(sampler.get(), e->ctx, -1);
            if(llama_vocab_is_eog(vocab, token)) return 0;
            std::vector<char> piece(256);
            int size = llama_token_to_piece(vocab, token, piece.data(), piece.size(), 0, false);
            if(size < 0) { piece.resize(-size); size = llama_token_to_piece(vocab, token, piece.data(), piece.size(), 0, false); }
            if(size < 0 || (emitted += size) > 8192) return -6;
            if(e->cancelled.load()) return 1;
            auto bytes = env->NewByteArray(size);
            if(!bytes) return -7;
            env->SetByteArrayRegion(bytes, 0, size, reinterpret_cast<const jbyte *>(piece.data()));
            if(e->timing[3]<0)e->timing[3]=micros(started);
            auto callbackStart=Clock::now();
            env->CallVoidMethod(callback, emit, bytes); env->DeleteLocalRef(bytes);
            e->timing[7]+=micros(callbackStart);
            ++e->timing[6];
            if(env->ExceptionCheck()) return -8;
            if(e->cancelled.load()) return 1;
            int decoded;
            { PhaseTime decodeTime{e->timing[2],Clock::now()}; decoded=llama_decode(e->ctx, llama_batch_get_one(&token, 1)); }
            if(decoded != 0) return e->cancelled.load() ? 1 : -9;
        }
        return -10; // A truncated answer is an error, not a completed medical response.
    } catch (...) { return -11; }
}

// NativeQwen.timings() shares the generation monitor; never read concurrently.
extern "C" JNIEXPORT jlongArray JNICALL Java_ai_neu205_one_NativeQwen_lastTimings(JNIEnv *env,jclass,jlong h) {
    auto result=env->NewLongArray(8);
    if(result)env->SetLongArrayRegion(result,0,8,engine(h)->timing.data());
    return result;
}
