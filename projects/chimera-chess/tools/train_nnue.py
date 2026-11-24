"""Train the CHIMERA trained evaluator (EvalVersion 3) in numpy. See evidence/v9/PREREG_nnue.md.
768 side-to-move-relative inputs -> H clipped-ReLU [0,1] -> 1. Loss: MSE(sigmoid(out), sigmoid(target/400)).
Writes nnue/<name>.bin (format below) and nnue/<name>.train.json (seed, curves, baseline comparison).
Binary format: b'CHNNUE1\\0', int32 H, float32 W1[768*H] (row = feature), b1[H], W2[H], b2[1]; cp = 400*out.
Usage: python tools/train_nnue.py nnue/dataset_v1.tsv.gz nnue/chimera-nnue-v1 [hidden] [epochs] [seed]"""
import gzip
import hashlib
import json
import os
import subprocess
import sys
import time

import numpy as np

PIECES = "PNBRQKpnbrqk"


def features(fen):
    board, stm = fen.split()[0], fen.split()[1]
    idx = []
    r = 7
    f = 0
    for ch in board:
        if ch == "/":
            r -= 1; f = 0; continue
        if ch.isdigit():
            f += int(ch); continue
        sq = r * 8 + f
        p = PIECES.index(ch)
        white = p < 6
        pt = p % 6
        if stm == "w":
            own = white; s = sq
        else:
            own = not white; s = sq ^ 56
        idx.append(((0 if own else 6) + pt) * 64 + s)
        f += 1
    return idx


def load(path):
    """Reads v1 (fen,score,split,source,game) or v2 (fen,score,evalv2_static,split,source,game) datasets."""
    X, y, base, split, src = [], [], [], [], []
    with gzip.open(path, "rt") as fo:
        head = next(fo).rstrip("\n").split("\t")
        for line in fo:
            r = dict(zip(head, line.rstrip("\n").split("\t")))
            X.append(features(r["fen"])); y.append(float(r["score_stm_cp"])); split.append(r["split"])
            base.append(float(r.get("evalv2_static", 0))); src.append((r["fen"], r["source"]))
    return X, np.array(y, np.float32), np.array(base, np.float32), np.array(split), src


def pack(Xs):
    n = len(Xs)
    m = max(len(x) for x in Xs)
    idx = np.full((n, m), 768, np.int64)  # 768 = padding row (zero, never trained)
    for i, x in enumerate(Xs):
        idx[i, :len(x)] = x
    return idx


def sig(x):
    return 1 / (1 + np.exp(-x))


class Net:
    def __init__(self, H, rng):
        self.H = H
        self.W1 = np.vstack([rng.normal(0, 0.05, (768, H)).astype(np.float32), np.zeros((1, H), np.float32)])
        self.b1 = np.full(H, 0.1, np.float32)
        self.W2 = rng.normal(0, 0.1, H).astype(np.float32)
        self.b2 = np.zeros(1, np.float32)
        self.params = ["W1", "b1", "W2", "b2"]
        self.m = {p: np.zeros_like(getattr(self, p)) for p in self.params}
        self.v = {p: np.zeros_like(getattr(self, p)) for p in self.params}
        self.t = 0

    def forward(self, idx):
        pre = self.W1[idx].sum(1) + self.b1
        h = np.clip(pre, 0, 1)
        return pre, h, h @ self.W2 + self.b2[0]

    def step(self, idx, y, lr, base=None):
        pre, h, out = self.forward(idx)
        if base is not None:
            out = out + base / 400
        s = sig(out); tgt = sig(y / 400)
        loss = float(np.mean((s - tgt) ** 2))
        g = 2 * (s - tgt) * s * (1 - s) / len(y)
        grads = {"W2": h.T @ g, "b2": np.array([g.sum()], np.float32)}
        dh = np.outer(g, self.W2) * ((pre > 0) & (pre < 1))
        grads["b1"] = dh.sum(0)
        dW1 = np.zeros_like(self.W1)
        np.add.at(dW1, idx.ravel(), np.repeat(dh, idx.shape[1], axis=0))
        dW1[768] = 0
        grads["W1"] = dW1
        self.t += 1
        for p in self.params:
            self.m[p] = 0.9 * self.m[p] + 0.1 * grads[p]
            self.v[p] = 0.999 * self.v[p] + 0.001 * grads[p] ** 2
            mh = self.m[p] / (1 - 0.9 ** self.t); vh = self.v[p] / (1 - 0.999 ** self.t)
            setattr(self, p, (getattr(self, p) - lr * mh / (np.sqrt(vh) + 1e-8)).astype(np.float32))
        return loss

    def loss(self, idx, y, base=None):
        _, _, out = self.forward(idx)
        if base is not None:
            out = out + base / 400
        return float(np.mean((sig(out) - sig(y / 400)) ** 2))

    def save(self, path, residual=False):
        with open(path, "wb") as f:
            f.write(b"CHNNUE2\0" if residual else b"CHNNUE1\0")
            f.write(np.array([self.H], np.int32).tobytes())
            f.write(self.W1[:768].astype(np.float32).tobytes())
            f.write(self.b1.tobytes()); f.write(self.W2.tobytes()); f.write(self.b2.tobytes())


def evalv2_loss(src, y, binary):
    """EvalV2 static eval (and EvalV1) through the same loss, via the native 'eval' command."""
    out = {}
    for ev in (1, 2):
        p = subprocess.Popen([binary], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        cmds = [f"setoption name EvalVersion value {ev}"]
        for fen, _ in src:
            cmds += [f"position fen {fen}", "eval"]
        cmds.append("quit")
        o, _ = p.communicate("\n".join(cmds) + "\n")
        vals = np.array([float(l.split()[1]) for l in o.splitlines() if l.startswith("eval ")], np.float32)
        out[f"EvalV{ev}_static"] = float(np.mean((sig(vals / 400) - sig(y / 400)) ** 2))
    return out


def main(data, name, H=128, epochs=12, seed=1, residual=False):
    rng = np.random.default_rng(seed)
    X, y, base_all, split, src = load(data)
    B = base_all if residual else None
    tr = np.where(split == "train")[0]; va = np.where(split == "val")[0]
    idx = pack(X)
    net = Net(H, rng)
    curve = []
    t0 = time.time()
    for ep in range(epochs):
        perm = rng.permutation(tr)
        lr = 1e-3 if ep < epochs * 0.7 else 3e-4
        tl = []
        for i in range(0, len(perm), 512):
            b = perm[i:i + 512]
            tl.append(net.step(idx[b], y[b], lr, None if B is None else B[b]))
        vl = net.loss(idx[va], y[va], None if B is None else B[va])
        curve.append({"epoch": ep + 1, "train_loss": round(float(np.mean(tl)), 6), "val_loss": round(vl, 6),
                      "elapsed_s": round(time.time() - t0, 1)})
        print(curve[-1], flush=True)
    os.makedirs(os.path.dirname(name) or ".", exist_ok=True)
    net.save(name + ".bin", residual)
    base = evalv2_loss([src[i] for i in va], y[va], os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "native", "chimera"))
    rep = {"data": data, "data_sha256": hashlib.sha256(open(data, "rb").read()).hexdigest(),
           "train_positions": int(len(tr)), "val_positions": int(len(va)), "hidden": H, "epochs": epochs, "seed": seed, "residual_on_evalv2": residual,
           "optimizer": "Adam(0.9,0.999) lr 1e-3 then 3e-4 (last 30%), batch 512", "params": 768 * H + 2 * H + 1,
           "curve": curve, "val_loss_trained": curve[-1]["val_loss"], "val_loss_baselines": base,
           "weights": name + ".bin", "weights_sha256": hashlib.sha256(open(name + ".bin", "rb").read()).hexdigest()}
    json.dump(rep, open(name + ".train.json", "w"), indent=1)
    print(json.dumps({k: rep[k] for k in ("val_loss_trained", "val_loss_baselines", "weights_sha256")}, indent=1))


if __name__ == "__main__":
    a = sys.argv
    main(a[1], a[2], int(a[3]) if len(a) > 3 else 128, int(a[4]) if len(a) > 4 else 12, int(a[5]) if len(a) > 5 else 1,
         len(a) > 6 and a[6] == "residual")
