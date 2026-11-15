#!/usr/bin/env python3
"""Make a Whisper ONNX encoder accept < 3000 mel frames (whisper.cpp 'audio_ctx' idea).

The HF export adds the full [1500, d] positional table to the conv output, which
fails for shorter inputs. We insert Slice(embed_positions, 0, seq_len) so the
encoder can process only the actual utterance (+ margin). The input model is
never modified; a new file is written. Accuracy impact MUST be measured
(asr_bench.py window='dyn') before the patched model is used.
"""
import sys
import onnx
from onnx import helper, TensorProto


def patch(src, dst):
    m = onnx.load(src)
    g = m.graph
    inits = {i.name: i for i in g.initializer}
    target = None
    for n in g.node:
        if n.op_type == "Add" and len(n.input) == 2 and n.input[1] in inits and list(inits[n.input[1]].dims)[0] == 1500:
            target = n
            break
    if target is None:
        raise SystemExit("positional Add not found")
    x, pos = target.input[0], target.input[1]
    new = [
        helper.make_node("Shape", [x], ["ctx_shape"], name="ctx_shape"),
        helper.make_node("Gather", ["ctx_shape", "ctx_axis1"], ["ctx_len"], name="ctx_gather", axis=0),
        helper.make_node("Slice", [pos, "ctx_zero", "ctx_len", "ctx_axis0"], ["ctx_pos"], name="ctx_slice"),
    ]
    g.initializer.extend([
        helper.make_tensor("ctx_axis1", TensorProto.INT64, [1], [1]),
        helper.make_tensor("ctx_zero", TensorProto.INT64, [1], [0]),
        helper.make_tensor("ctx_axis0", TensorProto.INT64, [1], [0]),
    ])
    target.input[1] = "ctx_pos"
    idx = list(g.node).index(target)
    for i, n in enumerate(new):
        g.node.insert(idx + i, n)
    onnx.save(m, dst)
    print("patched", target.name, "->", dst)


if __name__ == "__main__":
    patch(sys.argv[1], sys.argv[2])
