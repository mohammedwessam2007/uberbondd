# Reproduction

From a clean extraction on x86-64 Linux, run `./verify.sh` for the checkpoint integrity and a live offline neural decision. Run `./run-uci.sh` to attach a standard-chess GUI. Both commands use the bundled native runtime and model files. Use a compatible glibc-based Linux host. Full Python UCI with all ablations runs via `python -m engine.uci` after installing requirements.txt. Example interactive input is `uci`, `isready`, `position startpos moves e2e4`, then `go movetime 80`. Wait for bestmove before quit. Use `setoption name Mode value Legacy` to play with the old conventional search. The exact archived program is `python -I -S baseline/chimera-uci.pyz`.

Tested build environment and versions are in provenance/versions.txt. Standard inference needs no torch, JAX, network or teacher. Model conversion and the original v0 suite need the additional packages below. Paths in the shell examples assume the checkpoint root. The game and endgame experiments used Debian Stockfish 15.1-4 amd64, Threads 1, Hash 16 MiB. All external operations in the execution were public downloads. The raw results include simultaneous research jobs on a CPU-limited host; elapsed times vary across repetitions.

```sh
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest -v test_v6
.venv/bin/python verify_recovery.py
.venv/bin/python -m engine.uci
```

## Exact experiment entries

Set SF to the local stockfish executable. The recorded executable was /tmp/chimera-opponent/usr/games/stockfish. Rerunning experiments writes files named by --prefix. Use a separate extracted copy to keep the delivered manifest valid.

```sh
export SF=/tmp/chimera-opponent/usr/games/stockfish
.venv/bin/python tournament.py --sf "$SF"
.venv/bin/python tournament.py --sf "$SF" --prefix value --pair Value,Policy --pair Value,SF15 --pair Policy,V5
.venv/bin/python tournament.py --sf "$SF" --prefix bridge --ms 80 --pair Bridge,Policy --pair Bridge,SF15
.venv/bin/python tournament.py --sf "$SF" --heldout --prefix holdout --ms 80 --pair Bridge,Policy --pair Bridge,Quiescence --pair Bridge,SF15
.venv/bin/python tournament.py --sf "$SF" --prefix repeat --ms 80 --pair Bridge,SF15
.venv/bin/python tournament.py --sf "$SF" --heldout --prefix clock --ms 80 --pair ClockBridge,Policy --pair ClockBridge,SF15
.venv/bin/python summarize.py
.venv/bin/python replay_arena.py "$SF"
.venv/bin/python creative.py "$SF"
.venv/bin/python endgames.py /tmp/chimera-v6-tools/tables
.venv/bin/python -m mobile.check bin/linux-x86_64/chimera
.venv/bin/python ledger.py
```

The six small Syzygy WDL files used by endgames.py are listed by hash in provenance/syzygy.sha256. Download each basename from https://tablebase.lichess.ovh/tables/standard/3-4-5-wdl/ to reproduce the independent offline audit. Tables were only used for evaluation. They are unnecessary for UCI play.

## Weights and export

The original 5M weights are included. export_model.py uses the publisher's 5M preset, strict parameter matching and weights_only loading. It exports ONNX opset 17 with a float32-equivalent decomposition of RMS normalization and frozen self/opponent Elo conditioning of 2200. The number is a policy input. The effective input is eight 64-square, 12-plane histories, each oriented to its mover, earliest frame repeated for padding. Castling, repetition and en passant legality are enforced independently of the network features. Output sizes are 4352 move logits and 3 outcome logits. Real legality masks include mirrored black promotions.

export_critic.py converts step 6400000, ordinary params, of DeepMind's 9M action-value transformer. It restores all eight layers onto CPU, uses noncausal attention, learned positions, the publisher's 77 FEN tokens, action vocabulary and 128 return buckets. Haiku's original decoder validates the port. Inputs have different meanings in the two models. Only candidate moves and decision scores cross between them.

```sh
.venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch==2.5.1
.venv/bin/pip install onnx==1.17.0 jax==0.4.38 dm-haiku==0.0.13 orbax-checkpoint==0.11.5 jaxtyping==0.3.11
unzip -q provenance/searchless-9M-original.zip -d /tmp/chimera-v6-tools
.venv/bin/python export_model.py
.venv/bin/python export_critic.py /tmp/chimera-v6-tools/9M/6400000/params
.venv/bin/python validate_network.py
```

Production Python UCI checks pinned model hashes on load. Different exporter versions may emit different bytes. Validate numerical parity before adopting a newly generated file. The optional 79M screen was run with `python screen79.py /tmp/chimera-v6-tools/maia3-79m.pt` using the exact revision and LFS hash in provenance/maia79.json. The 79M file is outside the runtime bundle.

## Android

The separate mobile ZIP contains ARM64 binaries, runtime library, action map, both float models, quantized Maia and benchmark.sh. It needs a local executable directory and an Android API 28+ ARM64 environment. With device-owner access, extract the ZIP to an executable private directory, set execute permission on arm64/chimera-policy and benchmark.sh, then run:

```sh
LD_LIBRARY_PATH=arm64 ./arm64/chimera-policy models/maia5.onnx models/searchless9.onnx models/actions.txt
sh benchmark.sh > oneplus-benchmark.txt 2>&1
```

The single-model native variant takes just models/maia5.onnx or models/maia5-int8.onnx. Native mode runs bounded inference and a mate prover in the Bridge invocation. Its fixed forward pass finishes before it reads the next command. The multi-mode Python UCI exposes asynchronous stop. The on-device harness captures SoC, page size, thermal/battery snapshots, load time, peak RSS and 30 warm trials per position/mode. Snapshots alone cannot establish energy per move. No APK or GUI was installed. The host machine executed the same C++ inference and move-decoding source. Neither an emulator nor the owner's phone supplied device results.

Android was cross-compiled via `NDK=/workspace/neu205-tools/ndk sh mobile/build.sh`, followed by llvm-strip. Headers and ARM64 runtime come from the Maven package com.microsoft.onnxruntime:onnxruntime-android:1.20.0. Android LOAD segments are 16 KiB aligned. Host C++ uses the bundled ONNX Runtime 1.20.1 shared library. A host rebuild can link mobile/policy.cpp using -std=c++17 -O2 -DNDEBUG -Imobile/include and bin/linux-x86_64/libonnxruntime.so.1 with rpath $ORIGIN. The native mobile engine has no Python, server or network requirement.
