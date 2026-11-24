// CHIMERA V8 native core (C++17). Original code, 2026-11-23.
// Bitboard move generation, make/unmake with incremental Zobrist hashing, PVS alpha-beta with
// TT / null move / LMR / killers / history / SEE-pruned quiescence, and a hard-deadline time
// manager. EvalVersion 1 is a literal port of V7 chimera/evaluate.py (speed-only ablation);
// EvalVersion 2 adds mobility, king-attack weighting, passed-pawn and endgame terms (V8 eval).
// Build: g++ -std=c++17 -O2 -DNDEBUG -pthread native/chimera.cpp -o native/chimera
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
#include <unistd.h>

using U64 = uint64_t;
using Clock = std::chrono::steady_clock;

enum { WHITE = 0, BLACK = 1 };
enum { PAWN = 0, KNIGHT, BISHOP, ROOK, QUEEN, KING };
static const int NONE = -1;

static inline int lsb(U64 b) { return __builtin_ctzll(b); }
static inline int msb(U64 b) { return 63 - __builtin_clzll(b); }
static inline int popcnt(U64 b) { return __builtin_popcountll(b); }
static inline int pop_lsb(U64 &b) { int s = lsb(b); b &= b - 1; return s; }
static inline U64 bit(int s) { return 1ULL << s; }
static inline int file_of(int s) { return s & 7; }
static inline int rank_of(int s) { return s >> 3; }

// ------------------------------------------------------------------ attack tables
static U64 KN[64], KG[64], PA[2][64], RAY[8][64];
static const int DIRS[8] = {8, 1, 9, 7, -8, -1, -7, -9};  // N E NE NW S W SE SW (first 4 positive)
static U64 FILE_BB[8], RANK_BB[8], ADJ_FILE[8], PASSED_MASK[2][64];

static void init_tables() {
  for (int f = 0; f < 8; f++) { FILE_BB[f] = 0x0101010101010101ULL << f; }
  for (int r = 0; r < 8; r++) { RANK_BB[r] = 0xFFULL << (8 * r); }
  for (int f = 0; f < 8; f++) ADJ_FILE[f] = (f > 0 ? FILE_BB[f - 1] : 0) | (f < 7 ? FILE_BB[f + 1] : 0);
  for (int s = 0; s < 64; s++) {
    int f = file_of(s), r = rank_of(s);
    const int kn[8][2] = {{1, 2}, {2, 1}, {2, -1}, {1, -2}, {-1, -2}, {-2, -1}, {-2, 1}, {-1, 2}};
    KN[s] = 0;
    for (auto &d : kn) { int ff = f + d[0], rr = r + d[1]; if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) KN[s] |= bit(rr * 8 + ff); }
    KG[s] = 0;
    for (int df = -1; df <= 1; df++) for (int dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue;
      int ff = f + df, rr = r + dr;
      if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) KG[s] |= bit(rr * 8 + ff);
    }
    PA[WHITE][s] = PA[BLACK][s] = 0;
    if (r < 7) { if (f > 0) PA[WHITE][s] |= bit(s + 7); if (f < 7) PA[WHITE][s] |= bit(s + 9); }
    if (r > 0) { if (f > 0) PA[BLACK][s] |= bit(s - 9); if (f < 7) PA[BLACK][s] |= bit(s - 7); }
    const int df8[8] = {0, 1, 1, -1, 0, -1, 1, -1}, dr8[8] = {1, 0, 1, 1, -1, 0, -1, -1};
    for (int d = 0; d < 8; d++) {
      RAY[d][s] = 0;
      int ff = f + df8[d], rr = r + dr8[d];
      while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) { RAY[d][s] |= bit(rr * 8 + ff); ff += df8[d]; rr += dr8[d]; }
    }
    for (int c = 0; c < 2; c++) {
      U64 span = FILE_BB[f] | ADJ_FILE[f], ahead = 0;
      if (c == WHITE) for (int rr = r + 1; rr < 8; rr++) ahead |= RANK_BB[rr];
      else for (int rr = 0; rr < r; rr++) ahead |= RANK_BB[rr];
      PASSED_MASK[c][s] = span & ahead;
    }
  }
}

static inline U64 ray_att(int d, int s, U64 occ) {
  U64 a = RAY[d][s], b = a & occ;
  if (b) { int t = d < 4 ? lsb(b) : msb(b); a ^= RAY[d][t]; }
  return a;
}
static inline U64 rook_att(int s, U64 occ) { return ray_att(0, s, occ) | ray_att(1, s, occ) | ray_att(4, s, occ) | ray_att(5, s, occ); }
static inline U64 bishop_att(int s, U64 occ) { return ray_att(2, s, occ) | ray_att(3, s, occ) | ray_att(6, s, occ) | ray_att(7, s, occ); }

// ------------------------------------------------------------------ zobrist
static U64 ZP[12][64], ZSIDE, ZCASTLE[16], ZEP[8];
static void init_zobrist() {
  U64 x = 0x9E3779B97F4A7C15ULL;
  auto rnd = [&]() { x ^= x << 13; x ^= x >> 7; x ^= x << 17; return x * 0x2545F4914F6CDD1DULL; };
  for (auto &p : ZP) for (auto &v : p) v = rnd();
  ZSIDE = rnd();
  for (auto &v : ZCASTLE) v = rnd();
  for (auto &v : ZEP) v = rnd();
}

// ------------------------------------------------------------------ moves
// bits 0-5 from, 6-11 to, 12-14 promo piece type (0 = none, else KNIGHT..QUEEN), 15-16 flag
enum { F_NORMAL = 0, F_DOUBLE = 1, F_EP = 2, F_CASTLE = 3 };
using Move = uint32_t;
static inline Move mk(int f, int t, int promo = 0, int flag = 0) { return f | (t << 6) | (promo << 12) | (flag << 15); }
static inline int mfrom(Move m) { return m & 63; }
static inline int mto(Move m) { return (m >> 6) & 63; }
static inline int mpromo(Move m) { return (m >> 12) & 7; }
static inline int mflag(Move m) { return (m >> 15) & 3; }

static std::string sqname(int s) { std::string r; r += char('a' + file_of(s)); r += char('1' + rank_of(s)); return r; }
static std::string move_str(Move m) {
  if (!m) return "0000";
  std::string s = sqname(mfrom(m)) + sqname(mto(m));
  if (mpromo(m)) s += "nbrq"[mpromo(m) - 1];
  return s;
}

struct Undo { int captured; int castle; int ep; int half; U64 hash; };

struct Position {
  U64 bb[2][6];
  U64 occ[2];
  int board[64];  // -1 or color*6+type
  int side, castle, ep, half, fullmove;
  U64 hash;
  std::vector<U64> history;  // hashes of previous positions (for repetition)
  std::vector<Undo> undo;

  U64 all() const { return occ[0] | occ[1]; }
  void clear() {
    memset(bb, 0, sizeof bb); occ[0] = occ[1] = 0;
    for (int &x : board) x = NONE;
    side = WHITE; castle = 0; ep = -1; half = 0; fullmove = 1; hash = 0; history.clear(); undo.clear();
  }
  void put(int c, int p, int s) { bb[c][p] |= bit(s); occ[c] |= bit(s); board[s] = c * 6 + p; hash ^= ZP[c * 6 + p][s]; }
  void remove(int s) { int pc = board[s]; int c = pc / 6, p = pc % 6; bb[c][p] &= ~bit(s); occ[c] &= ~bit(s); board[s] = NONE; hash ^= ZP[pc][s]; }
  U64 compute_hash() const {
    U64 h = 0;
    for (int s = 0; s < 64; s++) if (board[s] != NONE) h ^= ZP[board[s]][s];
    if (side == BLACK) h ^= ZSIDE;
    h ^= ZCASTLE[castle];
    if (ep >= 0) h ^= ZEP[file_of(ep)];
    return h;
  }
  bool set_fen(const std::string &fen) {
    clear();
    std::istringstream is(fen);
    std::string pl, st, cs, eps; int hm = 0, fm = 1;
    is >> pl >> st >> cs >> eps;
    if (!(is >> hm)) hm = 0;
    if (!(is >> fm)) fm = 1;
    int r = 7, f = 0;
    for (char ch : pl) {
      if (ch == '/') { r--; f = 0; continue; }
      if (ch >= '1' && ch <= '8') { f += ch - '0'; continue; }
      const char *pcs = "pnbrqk";
      const char *q = strchr(pcs, tolower(ch));
      if (!q || r < 0 || f > 7) return false;
      int c = isupper(ch) ? WHITE : BLACK;
      put(c, int(q - pcs), r * 8 + f); f++;
    }
    side = st == "b" ? BLACK : WHITE;
    castle = 0;
    for (char ch : cs) { if (ch == 'K') castle |= 1; if (ch == 'Q') castle |= 2; if (ch == 'k') castle |= 4; if (ch == 'q') castle |= 8; }
    ep = -1;
    if (eps != "-" && eps.size() == 2) ep = (eps[1] - '1') * 8 + (eps[0] - 'a');
    half = hm; fullmove = fm;
    hash = compute_hash();
    return true;
  }
  bool attacked(int s, int by) const {
    U64 o = all();
    if (PA[by ^ 1][s] & bb[by][PAWN]) return true;
    if (KN[s] & bb[by][KNIGHT]) return true;
    if (KG[s] & bb[by][KING]) return true;
    if (bishop_att(s, o) & (bb[by][BISHOP] | bb[by][QUEEN])) return true;
    if (rook_att(s, o) & (bb[by][ROOK] | bb[by][QUEEN])) return true;
    return false;
  }
  U64 attackers(int s, int by, U64 o) const {
    return (PA[by ^ 1][s] & bb[by][PAWN]) | (KN[s] & bb[by][KNIGHT]) | (KG[s] & bb[by][KING]) |
           (bishop_att(s, o) & (bb[by][BISHOP] | bb[by][QUEEN])) | (rook_att(s, o) & (bb[by][ROOK] | bb[by][QUEEN]));
  }
  int king_sq(int c) const { return bb[c][KING] ? lsb(bb[c][KING]) : -1; }
  bool in_check() const { int k = king_sq(side); return k >= 0 && attacked(k, side ^ 1); }

  // pseudo-legal generation; caps_only generates captures + queen promotions
  void gen(std::vector<Move> &mv, bool caps_only) const {
    int us = side, them = side ^ 1;
    U64 own = occ[us], opp = occ[them], o = all(), empty = ~o;
    U64 p = bb[us][PAWN];
    int fwd = us == WHITE ? 8 : -8;
    int promo_rank = us == WHITE ? 7 : 0, start_rank = us == WHITE ? 1 : 6;
    while (p) {
      int s = pop_lsb(p);
      int t = s + fwd;
      if (t >= 0 && t < 64 && (empty & bit(t))) {
        if (rank_of(t) == promo_rank) {
          mv.push_back(mk(s, t, QUEEN));
          if (!caps_only) { mv.push_back(mk(s, t, ROOK)); mv.push_back(mk(s, t, BISHOP)); mv.push_back(mk(s, t, KNIGHT)); }
        } else if (!caps_only) {
          mv.push_back(mk(s, t));
          int t2 = t + fwd;
          if (rank_of(s) == start_rank && (empty & bit(t2))) mv.push_back(mk(s, t2, 0, F_DOUBLE));
        }
      }
      U64 a = PA[us][s] & opp;
      while (a) {
        int c = pop_lsb(a);
        if (rank_of(c) == promo_rank) {
          mv.push_back(mk(s, c, QUEEN));
          mv.push_back(mk(s, c, ROOK)); mv.push_back(mk(s, c, BISHOP)); mv.push_back(mk(s, c, KNIGHT));
        } else mv.push_back(mk(s, c));
      }
      if (ep >= 0 && (PA[us][s] & bit(ep))) mv.push_back(mk(s, ep, 0, F_EP));
    }
    U64 target = caps_only ? opp : ~own;
    for (int pt = KNIGHT; pt <= KING; pt++) {
      U64 b = bb[us][pt];
      while (b) {
        int s = pop_lsb(b);
        U64 a;
        switch (pt) {
          case KNIGHT: a = KN[s]; break;
          case BISHOP: a = bishop_att(s, o); break;
          case ROOK: a = rook_att(s, o); break;
          case QUEEN: a = bishop_att(s, o) | rook_att(s, o); break;
          default: a = KG[s];
        }
        a &= target;
        while (a) mv.push_back(mk(s, pop_lsb(a)));
      }
    }
    if (!caps_only) {
      if (us == WHITE) {
        if ((castle & 1) && !(o & (bit(5) | bit(6))) && board[4] == KING && board[7] == ROOK &&
            !attacked(4, BLACK) && !attacked(5, BLACK) && !attacked(6, BLACK)) mv.push_back(mk(4, 6, 0, F_CASTLE));
        if ((castle & 2) && !(o & (bit(1) | bit(2) | bit(3))) && board[4] == KING && board[0] == ROOK &&
            !attacked(4, BLACK) && !attacked(3, BLACK) && !attacked(2, BLACK)) mv.push_back(mk(4, 2, 0, F_CASTLE));
      } else {
        if ((castle & 4) && !(o & (bit(61) | bit(62))) && board[60] == 6 + KING && board[63] == 6 + ROOK &&
            !attacked(60, WHITE) && !attacked(61, WHITE) && !attacked(62, WHITE)) mv.push_back(mk(60, 62, 0, F_CASTLE));
        if ((castle & 8) && !(o & (bit(57) | bit(58) | bit(59))) && board[60] == 6 + KING && board[56] == 6 + ROOK &&
            !attacked(60, WHITE) && !attacked(59, WHITE) && !attacked(58, WHITE)) mv.push_back(mk(60, 58, 0, F_CASTLE));
      }
    }
  }

  // returns false (and leaves position unchanged) if the move leaves own king in check
  bool make(Move m) {
    static const int CMASK[64] = {
      13, 15, 15, 15, 12, 15, 15, 14, 15, 15, 15, 15, 15, 15, 15, 15,
      15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,
      15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,
      15, 15, 15, 15, 15, 15, 15, 15, 7, 15, 15, 15, 3, 15, 15, 11};
    int f = mfrom(m), t = mto(m), fl = mflag(m), pr = mpromo(m);
    int us = side, them = side ^ 1;
    Undo u{board[t], castle, ep, half, hash};
    history.push_back(hash);
    int pc = board[f];
    int pt = pc % 6;
    if (fl == F_EP) { int cs = t + (us == WHITE ? -8 : 8); u.captured = board[cs]; remove(cs); }
    else if (board[t] != NONE) remove(t);
    remove(f);
    put(us, pr ? pr : pt, t);
    if (fl == F_CASTLE) {
      if (t == 6) { remove(7); put(us, ROOK, 5); }
      else if (t == 2) { remove(0); put(us, ROOK, 3); }
      else if (t == 62) { remove(63); put(us, ROOK, 61); }
      else if (t == 58) { remove(56); put(us, ROOK, 59); }
    }
    if (ep >= 0) hash ^= ZEP[file_of(ep)];
    ep = -1;
    if (fl == F_DOUBLE) { ep = (f + t) / 2; hash ^= ZEP[file_of(ep)]; }
    hash ^= ZCASTLE[castle];
    castle &= CMASK[f] & CMASK[t];
    hash ^= ZCASTLE[castle];
    half = (pt == PAWN || u.captured != NONE) ? 0 : half + 1;
    side = them; hash ^= ZSIDE;
    if (us == BLACK) fullmove++;
    undo.push_back(u);
    int k = king_sq(us);
    if (k >= 0 && attacked(k, them)) { unmake(m); return false; }
    return true;
  }
  void unmake(Move m) {
    Undo u = undo.back(); undo.pop_back(); history.pop_back();
    int f = mfrom(m), t = mto(m), fl = mflag(m), pr = mpromo(m);
    side ^= 1;
    int us = side;
    if (us == BLACK) fullmove--;
    int pc = board[t];
    remove(t);
    put(us, pr ? PAWN : pc % 6, f);
    if (fl == F_EP) { int cs = t + (us == WHITE ? -8 : 8); put(us ^ 1, PAWN, cs); }
    else if (u.captured != NONE) put(u.captured / 6, u.captured % 6, t);
    if (fl == F_CASTLE) {
      if (t == 6) { remove(5); put(us, ROOK, 7); }
      else if (t == 2) { remove(3); put(us, ROOK, 0); }
      else if (t == 62) { remove(61); put(us, ROOK, 63); }
      else if (t == 58) { remove(59); put(us, ROOK, 56); }
    }
    castle = u.castle; ep = u.ep; half = u.half; hash = u.hash;
  }
  void make_null(Undo &u) {
    u = Undo{NONE, castle, ep, half, hash};
    history.push_back(hash);
    if (ep >= 0) hash ^= ZEP[file_of(ep)];
    ep = -1; side ^= 1; hash ^= ZSIDE; half++;
  }
  void unmake_null(const Undo &u) { history.pop_back(); side ^= 1; ep = u.ep; half = u.half; hash = u.hash; castle = u.castle; }

  bool is_repetition() const {
    int n = (int)history.size();
    for (int i = n - 2; i >= 0 && i >= n - half; i -= 2) if (history[i] == hash) return true;
    return false;
  }
  bool insufficient() const {
    if (bb[0][PAWN] | bb[1][PAWN] | bb[0][ROOK] | bb[1][ROOK] | bb[0][QUEEN] | bb[1][QUEEN]) return false;
    int minors = popcnt(bb[0][KNIGHT] | bb[1][KNIGHT] | bb[0][BISHOP] | bb[1][BISHOP]);
    return minors <= 1;
  }
  void legal(std::vector<Move> &out) {
    std::vector<Move> mv; mv.reserve(64); gen(mv, false);
    for (Move m : mv) if (make(m)) { unmake(m); out.push_back(m); }
  }
  Move parse(const std::string &s) {
    std::vector<Move> l; legal(l);
    for (Move m : l) if (move_str(m) == s) return m;
    return 0;
  }
};

// ------------------------------------------------------------------ evaluation
static const int PV[6] = {100, 320, 335, 500, 950, 20000};
static const int EGV[6] = {120, 300, 330, 540, 980, 0};
static const int PHASE_W[6] = {0, 1, 1, 2, 4, 0};
static int MG_PST[6][64], EG_PST[6][64];
static const int PASSED_BONUS[8] = {0, 5, 10, 18, 32, 55, 90, 0};
static int EVAL_VERSION = 2;
static int ARTIST_EXT = 0;
static int SKEPTIC = 0;          // V9 independent Skeptic (different evaluator + separate TT); off until it passes prereg
static int SKEPTIC_FIRED = 0, SKEPTIC_OVERRULED = 0;  // root sacrifice extension (#163/#118); off until it passes the pre-registered test

static int centre(int s) { int f = file_of(s), r = rank_of(s); return 6 - (std::abs(2 * f - 7) + std::abs(2 * r - 7)) / 2; }
static void init_pst() {
  // literal port of chimera/evaluate.py::_build (white perspective)
  for (int s = 0; s < 64; s++) {
    int f = file_of(s), r = rank_of(s), c = centre(s);
    MG_PST[PAWN][s] = (r == 0 || r == 7) ? 0 : (r - 1) * 6 + ((f == 3 || f == 4) && (r == 3 || r == 4) ? 8 : 0) - ((f == 3 || f == 4) && r == 1 ? 6 : 0);
    EG_PST[PAWN][s] = (r == 0 || r == 7) ? 0 : (r - 1) * 14;
    MG_PST[KNIGHT][s] = c * 8 - 25 + (r >= 2 ? 5 : 0);
    EG_PST[KNIGHT][s] = c * 6 - 18;
    MG_PST[BISHOP][s] = c * 4 - 8 + ((f == r || f + r == 7) ? 6 : 0);
    EG_PST[BISHOP][s] = c * 3 - 8;
    MG_PST[ROOK][s] = (r == 6 ? 18 : 0) + ((f == 3 || f == 4) ? 4 : 0) - ((f == 0 || f == 7) && r == 0 ? 4 : 0);
    EG_PST[ROOK][s] = r == 6 ? 10 : 0;
    MG_PST[QUEEN][s] = c * 2 - 4;
    EG_PST[QUEEN][s] = c * 4 - 10;
    MG_PST[KING][s] = (r == 0 && (f == 1 || f == 2 || f == 6) ? 20 : 0) + (r == 0 && (f == 0 || f == 7) ? 5 : 0) - r * 12 - ((f == 3 || f == 4) ? 10 : 0);
    EG_PST[KING][s] = c * 9 - 25;
  }
}
static inline int mirror(int s) { return s ^ 56; }

// floor division matching Python // for the tapered blend
static inline int fdiv(int a, int b) { int q = a / b; if ((a % b != 0) && ((a < 0) != (b < 0))) q--; return q; }

// ---- EvalVersion 3: trained evaluator (tools/train_nnue.py), float32, side-to-move relative
static std::vector<float> NN_W1, NN_B1, NN_W2;
static float NN_B2 = 0;
static int NN_H = 0;
static int NN_RESIDUAL = 0;  // CHNNUE2: eval = EvalV2 + net
static std::string NN_FILE;
static bool nnue_load(const std::string &path) {
  FILE *f = fopen(path.c_str(), "rb");
  if (!f) return false;
  char magic[8]; int32_t H = 0;
  bool ok = fread(magic, 1, 8, f) == 8 && (memcmp(magic, "CHNNUE1", 7) == 0 || memcmp(magic, "CHNNUE2", 7) == 0) &&
            fread(&H, 4, 1, f) == 1 && H > 0 && H <= 4096;
  int residual = ok && magic[6] == '2';
  if (ok) {
    std::vector<float> w1((size_t)768 * H), b1(H), w2(H); float b2;
    ok = fread(w1.data(), 4, w1.size(), f) == w1.size() && fread(b1.data(), 4, H, f) == (size_t)H &&
         fread(w2.data(), 4, H, f) == (size_t)H && fread(&b2, 4, 1, f) == 1;
    if (ok) { NN_W1.swap(w1); NN_B1.swap(b1); NN_W2.swap(w2); NN_B2 = b2; NN_H = H; NN_FILE = path; NN_RESIDUAL = residual; }
  }
  fclose(f);
  return ok;
}
static int nnue_eval(const Position &p) {
  float acc[4096];
  for (int i = 0; i < NN_H; i++) acc[i] = NN_B1[i];
  int stm = p.side;
  for (int c = 0; c < 2; c++) for (int pt = 0; pt < 6; pt++) {
    U64 b = p.bb[c][pt];
    while (b) {
      int s = pop_lsb(b);
      int own = c == stm;
      int sq = stm == WHITE ? s : (s ^ 56);
      const float *w = &NN_W1[(size_t)(((own ? 0 : 6) + pt) * 64 + sq) * NN_H];
      for (int i = 0; i < NN_H; i++) acc[i] += w[i];
    }
  }
  float out = NN_B2;
  for (int i = 0; i < NN_H; i++) { float h = acc[i] < 0 ? 0 : (acc[i] > 1 ? 1 : acc[i]); out += h * NN_W2[i]; }
  int cp = (int)(out * 400.0f);
  return std::max(-3000, std::min(3000, cp));
}

static int evaluate_hand(const Position &p);
static int evaluate(const Position &p) {
  if (EVAL_VERSION == 3 && NN_H > 0) {
    if (p.insufficient()) return 0;
    if (NN_RESIDUAL) { int saved = EVAL_VERSION; EVAL_VERSION = 2; int h = evaluate_hand(p); EVAL_VERSION = saved; return h + nnue_eval(p); }
    return nnue_eval(p);
  }
  return evaluate_hand(p);
}

static int evaluate_hand(const Position &p) {
  if (p.insufficient()) return 0;
  int mg = 0, eg = 0, phase = 0;
  U64 o = p.all();
  U64 pawns[2] = {p.bb[0][PAWN], p.bb[1][PAWN]};
  int katt_units[2] = {0, 0};  // V2: weighted attack units on each king
  for (int c = 0; c < 2; c++) {
    int sign = c == WHITE ? 1 : -1;
    U64 own = pawns[c], their = pawns[c ^ 1];
    int eking = p.king_sq(c ^ 1);
    U64 ezone = eking >= 0 ? (KG[eking] | bit(eking)) : 0;
    U64 their_pawn_att = 0;
    { U64 b = their; while (b) their_pawn_att |= PA[c ^ 1][pop_lsb(b)]; }
    for (int pt = 0; pt < 6; pt++) {
      U64 b = p.bb[c][pt];
      while (b) {
        int s = pop_lsb(b);
        int idx = c == WHITE ? s : mirror(s);
        mg += sign * ((pt != KING ? PV[pt] : 0) + MG_PST[pt][idx]);
        eg += sign * (EGV[pt] + EG_PST[pt][idx]);
        phase += PHASE_W[pt];
        if (pt == ROOK) {
          U64 fb = FILE_BB[file_of(s)];
          if (!(fb & own)) { int bonus = !(fb & their) ? 22 : 10; mg += sign * bonus; eg += sign * (bonus / 2); }
        } else if (pt == PAWN) {
          int fi = file_of(s);
          if (!(ADJ_FILE[fi] & own)) { mg -= sign * 12; eg -= sign * 16; }
          if (popcnt(FILE_BB[fi] & own) > 1) { mg -= sign * 6; eg -= sign * 12; }
          if (!(PASSED_MASK[c][s] & their)) {
            int rel = c == WHITE ? rank_of(s) : 7 - rank_of(s);
            // Python: mg += sign * PASSED_BONUS[rel] // 2  (sign*x)//2 floors toward -inf
            mg += fdiv(sign * PASSED_BONUS[rel], 2);
            eg += sign * PASSED_BONUS[rel];
            if (EVAL_VERSION >= 2) {
              int stop = c == WHITE ? s + 8 : s - 8;
              if (stop >= 0 && stop < 64 && p.board[stop] != NONE) eg -= sign * PASSED_BONUS[rel] / 3;  // blocked
              int ek = p.king_sq(c ^ 1), ok = p.king_sq(c);
              if (ek >= 0 && ok >= 0 && stop >= 0 && stop < 64) {
                int dist_e = std::max(std::abs(file_of(ek) - file_of(stop)), std::abs(rank_of(ek) - rank_of(stop)));
                int dist_o = std::max(std::abs(file_of(ok) - file_of(stop)), std::abs(rank_of(ok) - rank_of(stop)));
                eg += sign * (dist_e - dist_o) * rel * 3;
              }
            }
          }
        }
        if (EVAL_VERSION >= 2 && pt >= KNIGHT && pt <= QUEEN) {
          U64 a = pt == KNIGHT ? KN[s] : pt == BISHOP ? bishop_att(s, o) : pt == ROOK ? rook_att(s, o) : (bishop_att(s, o) | rook_att(s, o));
          int mob = popcnt(a & ~p.occ[c] & ~their_pawn_att);
          static const int MOB_MG[6] = {0, 4, 4, 2, 1, 0}, MOB_EG[6] = {0, 4, 4, 4, 2, 0};
          static const int MOB_BASE[6] = {0, 4, 6, 6, 12, 0};
          mg += sign * MOB_MG[pt] * (mob - MOB_BASE[pt]);
          eg += sign * MOB_EG[pt] * (mob - MOB_BASE[pt]);
          static const int UNITS[6] = {0, 2, 2, 3, 5, 0};
          if (a & ezone) katt_units[c] += UNITS[pt] * popcnt(a & ezone);
        }
      }
    }
    if (popcnt(p.bb[c][BISHOP]) >= 2) { mg += sign * 30; eg += sign * 45; }
    int ksq = p.king_sq(c);
    if (ksq >= 0) {
      U64 zone = KG[ksq];
      int shield = popcnt(zone & own);
      mg += sign * (8 * std::min(shield, 3));
      int enemy = c ^ 1, att = 0;
      U64 z = zone;
      U64 nok = ~(p.bb[0][KING] | p.bb[1][KING]);
      while (z) { int zs = pop_lsb(z); att += popcnt(p.attackers(zs, enemy, o) & nok); }
      mg -= sign * (6 * att + att * att);
    }
  }
  if (EVAL_VERSION >= 2) {
    // nonlinear king danger from weighted attack units (attacker side gains)
    for (int c = 0; c < 2; c++) {
      int u = katt_units[c];
      int danger = u * u / 4;
      if (!p.bb[c][QUEEN]) danger /= 2;
      mg += (c == WHITE ? 1 : -1) * std::min(danger, 500);
    }
  }
  phase = std::min(phase, 24);
  int score = fdiv(mg * phase + eg * (24 - phase), 24);
  score += p.side == WHITE ? 10 : -10;
  return p.side == WHITE ? score : -score;
}

// ------------------------------------------------------------------ search
static const int MATE = 100000, MATE_BOUND = MATE - 1000, INF = 1000000;
enum { EXACT = 0, LOWER = 1, UPPER = 2 };
struct TTE { U64 key; Move move; int32_t score; int16_t depth; uint8_t flag; };
static std::vector<TTE> TT;
static U64 TT_MASK = 0;
static std::vector<TTE> TT_SKEPTIC(1 << 16, TTE{0, 0, 0, -1, 0});
static void tt_resize(int mb) {
  size_t n = 1; while (n * 2 * sizeof(TTE) <= (size_t)mb * 1024 * 1024) n *= 2;
  TT.assign(n, TTE{0, 0, 0, -1, 0}); TT_MASK = n - 1;
}

struct Limits { std::vector<Move> searchmoves; long long movetime = -1, wtime = -1, btime = -1, winc = 0, binc = 0, movestogo = 0, nodes = -1; int depth = 64; bool infinite = false; };

struct Searcher {
  Position pos;
  std::atomic<bool> stop{false};
  long long nodes = 0, node_limit = -1;
  Clock::time_point start, hard_deadline;
  bool has_deadline = false;
  Move killers[128][2];
  int hist[2][64][64];
  Move root_best = 0; int root_score = 0;
  Move plan_hint = 0;   // Architect: next move of the persisted plan (ordering only, never forced)
  int stable_iters = 0; // how many final iterations kept the same best move (plan confidence input)
  bool aborted = false;

  bool time_up() {
    if (stop.load(std::memory_order_relaxed)) return true;
    if (node_limit >= 0 && nodes >= node_limit) return true;
    if (has_deadline && (nodes & 255) == 0 && Clock::now() >= hard_deadline) return true;
    return false;
  }

  int see_value(Move m) {
    int t = mto(m);
    int victim = pos.board[t] == NONE ? (mflag(m) == F_EP ? PAWN : -1) : pos.board[t] % 6;
    if (victim < 0) return 0;
    int gain[32], d = 0;
    U64 o = pos.all() & ~bit(mfrom(m));
    int attacker = pos.board[mfrom(m)] % 6;
    gain[0] = PV[victim];
    int cur = PV[attacker];
    if (mpromo(m)) { cur = PV[mpromo(m)]; gain[0] += PV[mpromo(m)] - PV[PAWN]; }
    int s = pos.side ^ 1;
    while (true) {
      U64 a = pos.attackers(t, s, o) & o;
      if (!a) break;
      int best_v = INF, best_s = -1;
      for (int pt = 0; pt < 6; pt++) { U64 x = a & pos.bb[s][pt]; if (x) { best_s = lsb(x); best_v = PV[pt]; break; } }
      d++;
      if (d >= 31) break;
      gain[d] = cur - gain[d - 1];
      if (std::max(-gain[d - 1], gain[d]) < 0) break;
      o &= ~bit(best_s);
      cur = best_v; s ^= 1;
      if (best_v == PV[KING]) { if (pos.attackers(t, s, o) & o) gain[d] = -INF; break; }
    }
    while (d > 0) { gain[d - 1] = -std::max(-gain[d - 1], gain[d]); d--; }
    return gain[0];
  }

  // Artist tag: material offer at the root (losing capture, en-prise quiet move of a piece, sacrificial check)
  bool artistic(Move m) {
    int f = mfrom(m), t = mto(m);
    int pt = pos.board[f] % 6;
    if (pt == KING) return false;
    if (is_cap(m)) return see_value(m) < 0;
    if (pt == PAWN && !mpromo(m)) return false;
    U64 o = (pos.all() & ~bit(f)) | bit(t);
    U64 att = pos.attackers(t, pos.side ^ 1, o) & o;
    if (!att) return false;
    U64 def = pos.attackers(t, pos.side, o) & o & ~bit(t);
    int cheapest = 100000;
    for (int q = 0; q < 6; q++) if (att & pos.bb[pos.side ^ 1][q]) { cheapest = PV[q]; break; }
    int val = PV[mpromo(m) ? mpromo(m) : pt];
    return !def || cheapest < val;
  }

  int score_move(Move m, Move tt, int ply) {
    if (m == tt) return 10000000;
    int t = mto(m);
    if (pos.board[t] != NONE || mflag(m) == F_EP) {
      int victim = pos.board[t] == NONE ? PAWN : pos.board[t] % 6;
      int att = pos.board[mfrom(m)] % 6;
      return 1000000 + 10 * PV[victim] - PV[att] / 10 + (mpromo(m) ? PV[mpromo(m)] : 0);
    }
    if (mpromo(m)) return 900000 + PV[mpromo(m)];
    if (ply < 128 && m == killers[ply][0]) return 800000;
    if (ply < 128 && m == killers[ply][1]) return 700000;
    return hist[pos.side][mfrom(m)][mto(m)];
  }
  void order(std::vector<Move> &mv, Move tt, int ply) {
    std::vector<std::pair<int, Move>> s; s.reserve(mv.size());
    for (Move m : mv) s.push_back({score_move(m, tt, ply), m});
    std::stable_sort(s.begin(), s.end(), [](auto &a, auto &b) { return a.first > b.first; });
    for (size_t i = 0; i < mv.size(); i++) mv[i] = s[i].second;
  }
  bool is_cap(Move m) const { return pos.board[mto(m)] != NONE || mflag(m) == F_EP; }

  int qsearch(int alpha, int beta, int ply) {
    nodes++;
    if (time_up()) { aborted = true; return 0; }
    bool inc = pos.in_check();
    if (ply > 120) return evaluate(pos);
    int stand = -INF;
    if (!inc) {
      stand = evaluate(pos);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
    }
    std::vector<Move> mv; mv.reserve(48);
    pos.gen(mv, !inc);
    std::vector<std::pair<int, Move>> cand;
    for (Move m : mv) {
      if (!inc) {
        if (is_cap(m)) {
          int victim = pos.board[mto(m)] == NONE ? PAWN : pos.board[mto(m)] % 6;
          if (stand + PV[victim] + 200 < alpha && !mpromo(m)) continue;
          int sv = see_value(m);
          if (sv < 0) continue;
          cand.push_back({sv, m});
        } else if (mpromo(m) == QUEEN) cand.push_back({800, m});
      } else cand.push_back({score_move(m, 0, std::min(ply, 127)), m});
    }
    std::stable_sort(cand.begin(), cand.end(), [](auto &a, auto &b) { return a.first > b.first; });
    int best = inc ? -INF : stand, legal = 0;
    for (auto &c : cand) {
      if (!pos.make(c.second)) continue;
      legal++;
      int s = -qsearch(-beta, -alpha, ply + 1);
      pos.unmake(c.second);
      if (aborted) return 0;
      if (s > best) best = s;
      if (s > alpha) { alpha = s; if (alpha >= beta) break; }
    }
    if (inc && legal == 0) return -MATE + ply;
    return inc ? best : alpha;
  }

  bool has_pieces(int c) const { return pos.bb[c][KNIGHT] | pos.bb[c][BISHOP] | pos.bb[c][ROOK] | pos.bb[c][QUEEN]; }

  int negamax(int depth, int alpha, int beta, int ply, bool allow_null) {
    nodes++;
    if (time_up()) { aborted = true; return 0; }
    if (ply > 0) {
      if (pos.half >= 100 || pos.is_repetition() || pos.insufficient()) return 0;
      alpha = std::max(alpha, -MATE + ply);
      beta = std::min(beta, MATE - ply - 1);
      if (alpha >= beta) return alpha;
    }
    bool inc = pos.in_check();
    if (inc) depth++;
    if (depth <= 0) return qsearch(alpha, beta, ply);
    if (ply > 120) return evaluate(pos);

    TTE &e = TT[pos.hash & TT_MASK];
    Move tt_move = 0;
    if (e.key == pos.hash) {
      tt_move = e.move;
      if (e.depth >= depth && ply > 0) {
        int sc = e.score;
        if (sc >= MATE_BOUND) sc -= ply; else if (sc <= -MATE_BOUND) sc += ply;
        if (e.flag == EXACT) return sc;
        if (e.flag == LOWER && sc >= beta) return sc;
        if (e.flag == UPPER && sc <= alpha) return sc;
      }
    }
    bool pv = beta - alpha > 1;
    int stat = -INF;
    if (!inc && !pv) {
      stat = evaluate(pos);
      if (depth <= 3 && stat - 120 * depth >= beta && std::abs(beta) < MATE_BOUND) return stat;
      if (allow_null && depth >= 3 && stat >= beta && has_pieces(pos.side)) {
        Undo u; pos.make_null(u);
        int r = 2 + depth / 4;
        int s = -negamax(depth - 1 - r, -beta, -beta + 1, ply + 1, false);
        pos.unmake_null(u);
        if (aborted) return 0;
        if (s >= beta && std::abs(s) < MATE_BOUND) return beta;
      }
    }
    std::vector<Move> mv; mv.reserve(64);
    pos.gen(mv, false);
    order(mv, tt_move, std::min(ply, 127));
    int best = -INF, legal = 0, orig_alpha = alpha;
    Move best_move = 0;
    for (size_t i = 0; i < mv.size(); i++) {
      Move m = mv[i];
      bool cap = is_cap(m);
      bool quiet = !cap && !mpromo(m);
      if (!pos.make(m)) continue;
      legal++;
      bool gives_check = pos.in_check();
      if (quiet && !inc && !gives_check && !pv && depth <= 2 && legal > 1 && best > -MATE_BOUND) {
        if (stat == -INF) { pos.unmake(m); stat = evaluate(pos); pos.make(m); }
        if (stat + 150 * depth <= alpha) { pos.unmake(m); continue; }
      }
      int s;
      if (legal == 1) s = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        int r = 0;
        if (depth >= 3 && legal >= 4 && quiet && !inc && !gives_check) {
          r = 1 + (legal >= 9) + (depth >= 6);
          if (pv) r--;
        }
        s = -negamax(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
        if (!aborted && s > alpha && r > 0) s = -negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (!aborted && alpha < s && s < beta) s = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake(m);
      if (aborted) return 0;
      if (s > best) { best = s; best_move = m; }
      if (s > alpha) {
        alpha = s;
        if (alpha >= beta) {
          if (quiet && ply < 128) {
            if (killers[ply][0] != m) { killers[ply][1] = killers[ply][0]; killers[ply][0] = m; }
            hist[pos.side][mfrom(m)][mto(m)] += depth * depth;
          }
          break;
        }
      }
    }
    if (legal == 0) return inc ? -MATE + ply : 0;
    int flag = best <= orig_alpha ? UPPER : best >= beta ? LOWER : EXACT;
    int store = best;
    if (store >= MATE_BOUND) store += ply; else if (store <= -MATE_BOUND) store -= ply;
    if (e.key != pos.hash || depth >= e.depth || flag == EXACT) e = TTE{pos.hash, best_move, store, (int16_t)depth, (uint8_t)flag};
    return best;
  }

  std::string pv_line(Move first, int limit = 12) {
    std::string out = move_str(first);
    std::vector<Move> made;
    if (!pos.make(first)) return out;
    made.push_back(first);
    for (int i = 1; i < limit; i++) {
      TTE &e = TT[pos.hash & TT_MASK];
      if (e.key != pos.hash || !e.move) break;
      std::vector<Move> l; pos.legal(l);
      if (std::find(l.begin(), l.end(), e.move) == l.end()) break;
      if (pos.is_repetition()) break;
      pos.make(e.move); made.push_back(e.move);
      out += " " + move_str(e.move);
    }
    for (auto it = made.rbegin(); it != made.rend(); ++it) pos.unmake(*it);
    return out;
  }

  // returns best move; prints info lines via callback
  Move think(const Limits &lim, double soft_ms, double hard_ms, bool print, int &out_depth) {
    start = Clock::now();
    has_deadline = hard_ms > 0;
    if (has_deadline) hard_deadline = start + std::chrono::microseconds((long long)(hard_ms * 1000));
    node_limit = lim.nodes;
    nodes = 0; aborted = false;
    memset(killers, 0, sizeof killers);
    for (auto &a : hist) for (auto &b : a) for (auto &c : b) c /= 8;
    std::vector<Move> root; pos.legal(root);
    if (!lim.searchmoves.empty()) {
      std::vector<Move> r2;
      for (Move m : root) if (std::find(lim.searchmoves.begin(), lim.searchmoves.end(), m) != lim.searchmoves.end()) r2.push_back(m);
      if (!r2.empty()) root.swap(r2);
    }
    out_depth = 0;
    if (root.empty()) return 0;
    Move best = root[0];
    int best_score = 0;
    if (root.size() == 1 && !lim.infinite && lim.searchmoves.empty()) { root_best = best; return best; }
    order(root, TT[pos.hash & TT_MASK].key == pos.hash ? TT[pos.hash & TT_MASK].move : 0, 0);
    if (plan_hint) {
      auto it = std::find(root.begin(), root.end(), plan_hint);
      if (it != root.end()) std::rotate(root.begin(), it, it + 1);
    }
    stable_iters = 0;
    std::vector<int> scores(root.size(), -INF);
    std::vector<char> art(root.size(), 0);
    int n_art = 0;
    if (ARTIST_EXT) for (size_t i = 0; i < root.size(); i++) { art[i] = artistic(root[i]); n_art += art[i]; }
    (void)n_art;
    for (int depth = 1; depth <= lim.depth; depth++) {
      int alpha = -INF, beta = INF;
      int window = 40;
      if (depth >= 4 && std::abs(best_score) < MATE_BOUND) { alpha = best_score - window; beta = best_score + window; }
      Move it_best = 0; int it_score = -INF;
      while (true) {
        it_best = 0; it_score = -INF;
        int a = alpha;
        for (size_t i = 0; i < root.size(); i++) {
          Move m = root[i];
          int ext = (ARTIST_EXT && art[i] && depth >= 3) ? 1 : 0;
          pos.make(m);
          int s;
          if (i == 0) s = -negamax(depth - 1 + ext, -beta, -a, 1, true);
          else {
            s = -negamax(depth - 1 + ext, -a - 1, -a, 1, true);
            if (!aborted && a < s && s < beta) s = -negamax(depth - 1 + ext, -beta, -a, 1, true);
          }
          pos.unmake(m);
          if (aborted) break;
          scores[i] = s;
          if (s > it_score) { it_score = s; it_best = m; }
          if (s > a) a = s;
        }
        if (aborted) break;
        if (it_score <= alpha && alpha > -INF) { alpha = -INF; continue; }
        if (it_score >= beta && beta < INF) { beta = INF; continue; }
        break;
      }
      if (aborted) {
        // partially searched deeper iteration: keep it only if its first (previous best) move was confirmed
        // or a later move already beat the previous best score at the deeper depth
        if (it_best && it_score > best_score && it_best != best) { best = it_best; best_score = it_score; }
        break;
      }
      stable_iters = (it_best == best) ? stable_iters + 1 : 1;
      best = it_best; best_score = it_score; out_depth = depth;
      // reorder root by score (stable), best first
      std::vector<std::pair<std::pair<int, int>, Move>> rs;
      for (size_t i = 0; i < root.size(); i++) rs.push_back({{scores[i], (int)art[i]}, root[i]});
      std::stable_sort(rs.begin(), rs.end(), [](auto &x, auto &y) { return x.first.first > y.first.first; });
      for (size_t i = 0; i < root.size(); i++) { root[i] = rs[i].second; scores[i] = rs[i].first.first; art[i] = (char)rs[i].first.second; }
      double el = std::chrono::duration<double, std::milli>(Clock::now() - start).count();
      if (print) {
        std::string sc;
        if (best_score >= MATE_BOUND) sc = "mate " + std::to_string((MATE - best_score + 1) / 2);
        else if (best_score <= -MATE_BOUND) sc = "mate -" + std::to_string((MATE + best_score + 1) / 2);
        else sc = "cp " + std::to_string(best_score);
        printf("info depth %d score %s nodes %lld time %d nps %lld pv %s\n", depth, sc.c_str(), nodes, (int)el,
               (long long)(nodes / std::max(el / 1000.0, 1e-6)), pv_line(best).c_str());
        fflush(stdout);
      }
      if (std::abs(best_score) >= MATE_BOUND && depth > 2 * (MATE - std::abs(best_score)) + 2) break;
      if (soft_ms > 0 && el > soft_ms) break;
      if (stop.load()) break;
    }
    if (SKEPTIC && best && out_depth >= 4 && artistic(best)) {
      Move alt = 0;
      for (Move m : root) if (m != best && !artistic(m)) { alt = m; break; }  // root is sorted best-first
      if (alt) {
        SKEPTIC_FIRED++;
        int keep_ev = EVAL_VERSION;
        int skev = (EVAL_VERSION == 3 || NN_H == 0) ? 1 : 3;
        U64 keep_mask = TT_MASK;
        std::swap(TT, TT_SKEPTIC); TT_MASK = TT.size() - 1;
        EVAL_VERSION = skev;
        int dd = std::max(4, out_depth - 3);
        int sc[2] = {0, 0};
        Move cand[2] = {best, alt};
        for (int k = 0; k < 2 && !aborted; k++) {
          pos.make(cand[k]);
          sc[k] = -negamax(dd - 1, -INF, INF, 1, true);
          pos.unmake(cand[k]);
        }
        EVAL_VERSION = keep_ev;
        std::swap(TT, TT_SKEPTIC); TT_MASK = keep_mask;
        bool done = !aborted;
        aborted = false;
        if (done && sc[0] < sc[1] - 50) {
          SKEPTIC_OVERRULED++;
          if (print) { printf("info string skeptic overrules %s (%d) for %s (%d) eval%d depth %d\n", move_str(best).c_str(), sc[0], move_str(alt).c_str(), sc[1], skev, dd); fflush(stdout); }
          best = alt;
        } else if (print) { printf("info string skeptic %s %s (%d vs %d) eval%d depth %d\n", done ? "accepts" : "timed-out", move_str(best).c_str(), sc[0], sc[1], skev, dd); fflush(stdout); }
      }
    }
    root_best = best; root_score = best_score;
    return best;
  }
};

// ------------------------------------------------------------------ perft
static U64 perft(Position &p, int d) {
  if (d == 0) return 1;
  std::vector<Move> mv; mv.reserve(64); p.gen(mv, false);
  U64 n = 0;
  for (Move m : mv) { if (!p.make(m)) continue; n += perft(p, d - 1); p.unmake(m); }
  return n;
}

// ------------------------------------------------------------------ Architect plan state (V9)
// Persistent strategic state carried across real moves of one game. Versioned; reset on new game,
// arbitrary FEN or any history that is not a continuation of the engine's own last move.
static int PLAN_MEMORY = 0;
struct PlanState {
  bool valid = false;
  int version = 0, plies_alive = 0, hits = 0, surprises = 0, breaks = 0;
  U64 hash_after_our_move = 0;
  Move our_move = 0, pred_reply = 0, next_move = 0;
  int expected = 0, confidence = 0;
  std::vector<Move> pv;
  std::vector<std::pair<int, int>> prereq;  // (square, piece code) our plan relies on
  std::string objective = "none", status = "NONE";
};
static PlanState PLAN;

static std::string classify_objective(Position &p, const std::vector<Move> &pv, int score) {
  if (score >= MATE_BOUND) return "forced-mate";
  int us = p.side, ek = p.king_sq(us ^ 1);
  U64 ezone = ek >= 0 ? (KG[ek] | bit(ek)) : 0;
  int caps = 0, zone_moves = 0, pawn_moves = 0, pawn_file = -1;
  std::vector<Move> made;
  for (size_t i = 0; i < pv.size() && i < 8; i++) {
    Move m = pv[i];
    bool ours = (i % 2) == 0;
    int pc = p.board[mfrom(m)];
    if (ours) {
      if (p.board[mto(m)] != NONE) caps++;
      if (bit(mto(m)) & ezone) zone_moves++;
      if (pc % 6 == PAWN) { pawn_moves++; pawn_file = file_of(mto(m)); }
    }
    if (!p.make(m)) break;
    made.push_back(m);
  }
  for (auto it = made.rbegin(); it != made.rend(); ++it) p.unmake(*it);
  if (zone_moves >= 2) return "king-attack";
  if (caps >= 2 || score >= 300) return "material-conversion";
  if (pawn_moves) return std::string("pawn-lever-") + char('a' + pawn_file);
  if (!pv.empty()) return "piece-to-" + sqname(mto(pv[0]));
  return "none";
}

// Called at 'go': validate the stored plan against the game continuation. Returns soft-budget multiplier.
static double plan_observe(Position &p, const std::vector<Move> &game_moves) {
  if (!PLAN.valid) { PLAN.status = "NONE"; return 1.0; }
  bool cont = !game_moves.empty() && !p.history.empty() && p.history.back() == PLAN.hash_after_our_move;
  if (!cont) { int v = PLAN.version; PLAN = PlanState(); PLAN.version = v + 1; PLAN.status = "RESET"; return 1.0; }
  Move opp = game_moves.back();
  std::vector<Move> legal; p.legal(legal);
  bool next_legal = PLAN.next_move && std::find(legal.begin(), legal.end(), PLAN.next_move) != legal.end();
  bool prereq_ok = true;
  for (auto &q : PLAN.prereq) if (p.board[q.first] != q.second) prereq_ok = false;
  PLAN.plies_alive += 2;
  if (opp == PLAN.pred_reply && next_legal && prereq_ok) { PLAN.status = "ON_TRACK"; PLAN.hits++; return 0.75; }
  if (!prereq_ok || !next_legal) { PLAN.status = "BROKEN"; PLAN.breaks++; return 1.5; }
  PLAN.status = "SURPRISED"; PLAN.surprises++; return 1.35;
}

static void plan_record(Searcher &S, Move best, int depth) {
  Position &p = S.pos;
  std::vector<Move> pv;
  if (best && p.make(best)) {
    pv.push_back(best);
    U64 after = p.hash;
    std::vector<Move> made{best};
    for (int i = 1; i < 8; i++) {
      TTE &e = TT[p.hash & TT_MASK];
      if (e.key != p.hash || !e.move) break;
      std::vector<Move> l; p.legal(l);
      if (std::find(l.begin(), l.end(), e.move) == l.end()) break;
      p.make(e.move); made.push_back(e.move); pv.push_back(e.move);
    }
    for (auto it = made.rbegin(); it != made.rend(); ++it) p.unmake(*it);
    PLAN.hash_after_our_move = after;
  } else { PLAN.valid = false; return; }
  PLAN.valid = true;
  PLAN.our_move = best;
  PLAN.pred_reply = pv.size() > 1 ? pv[1] : 0;
  PLAN.next_move = pv.size() > 2 ? pv[2] : 0;
  PLAN.pv = pv;
  PLAN.expected = S.root_score;
  PLAN.confidence = std::min(100, S.stable_iters * 100 / std::max(1, depth));
  PLAN.prereq.clear();
  for (size_t i = 2; i < pv.size() && i < 7; i += 2) PLAN.prereq.push_back({mfrom(pv[i]), p.board[mfrom(pv[i])]});
  // prerequisites are the origin squares of our later plan moves, valid after our move + predicted reply
  PLAN.prereq.erase(std::remove_if(PLAN.prereq.begin(), PLAN.prereq.end(), [&](auto &q) { return q.second == NONE; }), PLAN.prereq.end());
  PLAN.objective = classify_objective(p, pv, S.root_score);
}

static void plan_print() {
  std::string pv;
  for (Move m : PLAN.pv) pv += (pv.empty() ? "" : " ") + move_str(m);
  printf("info string plan v%d status=%s objective=%s expect=%d conf=%d pred_reply=%s next=%s alive=%d hits=%d surprises=%d breaks=%d prereq=%zu line=%s\n",
         PLAN.version, PLAN.status.c_str(), PLAN.objective.c_str(), PLAN.expected, PLAN.confidence, move_str(PLAN.pred_reply).c_str(),
         move_str(PLAN.next_move).c_str(), PLAN.plies_alive, PLAN.hits, PLAN.surprises, PLAN.breaks, PLAN.prereq.size(), pv.c_str());
  fflush(stdout);
}

// ------------------------------------------------------------------ UCI
static const char *START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

int main(int argc, char **argv) {
  init_tables(); init_zobrist(); init_pst();
  {
    char buf[4096]; ssize_t n = readlink("/proc/self/exe", buf, sizeof buf - 1);
    if (n > 0) {
      buf[n] = 0; std::string d(buf); d = d.substr(0, d.rfind('/'));
      if (!nnue_load(d + "/../nnue/chimera-nnue.bin")) nnue_load(d + "/chimera-nnue.bin");  // no default net ships (V9: both trained nets failed)
    }
  }
  tt_resize(64);
  Searcher S;
  S.pos.set_fen(START);
  memset(S.hist, 0, sizeof S.hist);
  std::thread worker;
  std::mutex out_mu;
  double overhead_ms = 10;  // safety margin subtracted from every budget
  if (argc > 1 && std::string(argv[1]) == "bench") {
    // deterministic fixed-depth bench: nodes and nps on a set of positions
    const char *fens[] = {START, "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
                          "r2q1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP2BPPP/R2Q1RK1 w - - 0 10",
                          "8/5pk1/6p1/3P4/5P2/6P1/5K2/8 w - - 0 40"};
    int depth = argc > 2 ? atoi(argv[2]) : 8;
    long long total = 0; auto t0 = Clock::now();
    for (auto f : fens) { S.pos.set_fen(f); Limits l; l.depth = depth; int d; Move m = S.think(l, -1, -1, false, d); total += S.nodes; printf("%s %s %lld\n", f, move_str(m).c_str(), S.nodes); }
    double el = std::chrono::duration<double>(Clock::now() - t0).count();
    printf("bench nodes %lld time %.3f nps %lld\n", total, el, (long long)(total / el));
    return 0;
  }
  std::string line;
  std::vector<Move> game_moves;
  auto join = [&]() { if (worker.joinable()) worker.join(); };
  while (std::getline(std::cin, line)) {
    std::istringstream is(line);
    std::string cmd; is >> cmd;
    if (cmd == "uci") {
      printf("id name CHIMERA V8 native\nid author CHIMERA project\n");
      printf("option name Hash type spin default 64 min 1 max 1024\n");
      printf("option name MoveOverheadMs type spin default 10 min 0 max 5000\n");
      printf("option name EvalVersion type spin default 2 min 1 max 3\n");
      printf("option name EvalFile type string default <exe>/../nnue/chimera-nnue.bin\n");
      printf("option name ArtistExtension type check default false\n");
      printf("option name PlanMemory type check default false\n");
      printf("option name Skeptic type check default false\n");
      printf("uciok\n"); fflush(stdout);
    } else if (cmd == "isready") { join(); printf("readyok\n"); fflush(stdout); }
    else if (cmd == "setoption") {
      join();
      std::string tok, name, value; bool in_value = false;
      while (is >> tok) {
        if (tok == "name") continue;
        if (tok == "value") { in_value = true; continue; }
        std::string &dst = in_value ? value : name;
        if (!dst.empty()) dst += " ";
        dst += tok;
      }
      if (name == "Hash") tt_resize(std::max(1, atoi(value.c_str())));
      else if (name == "MoveOverheadMs") overhead_ms = atof(value.c_str());
      else if (name == "EvalVersion") {
        EVAL_VERSION = std::max(1, std::min(3, atoi(value.c_str())));
        if (EVAL_VERSION == 3 && NN_H == 0) { printf("info string EvalVersion 3 requested but no EvalFile loaded; using EvalVersion 2\n"); fflush(stdout); EVAL_VERSION = 2; }
      }
      else if (name == "EvalFile") { if (nnue_load(value)) printf("info string loaded %s H=%d\n", value.c_str(), NN_H); else printf("info string failed to load %s\n", value.c_str()); fflush(stdout); }
      else if (name == "ArtistExtension") ARTIST_EXT = value == "true" ? 1 : 0;
      else if (name == "PlanMemory") PLAN_MEMORY = value == "true" ? 1 : 0;
      else if (name == "Skeptic") SKEPTIC = value == "true" ? 1 : 0;
    } else if (cmd == "ucinewgame") { join(); { int v = PLAN.version; PLAN = PlanState(); PLAN.version = v + 1; } tt_resize((int)((TT.size() * sizeof(TTE)) >> 20)); memset(S.hist, 0, sizeof S.hist); S.pos.set_fen(START); }
    else if (cmd == "position") {
      join();
      std::string t; is >> t;
      game_moves.clear();
      if (t == "startpos") { S.pos.set_fen(START); is >> t; }
      else if (t == "fen") {
        std::string fen, x; int n = 0;
        while (is >> x && x != "moves") { fen += (n++ ? " " : "") + x; }
        S.pos.set_fen(fen); t = x;
      }
      if (t == "moves") {
        std::string u;
        while (is >> u) {
          Move m = S.pos.parse(u);
          if (!m) { printf("info string illegal move %s ignored\n", u.c_str()); fflush(stdout); break; }
          S.pos.make(m);
          game_moves.push_back(m);
        }
      }
    } else if (cmd == "go") {
      join();
      Limits l; std::string t;
      int perft_d = -1;
      while (is >> t) {
        if (t == "movetime") is >> l.movetime; else if (t == "wtime") is >> l.wtime; else if (t == "btime") is >> l.btime;
        else if (t == "winc") is >> l.winc; else if (t == "binc") is >> l.binc; else if (t == "movestogo") is >> l.movestogo;
        else if (t == "depth") is >> l.depth; else if (t == "nodes") is >> l.nodes; else if (t == "infinite") l.infinite = true;
        else if (t == "perft") is >> perft_d;
        else if (t == "searchmoves") { std::string u; while (is >> u) { Move m = S.pos.parse(u); if (m) l.searchmoves.push_back(m); } }
      }
      if (perft_d >= 0) {
        std::vector<Move> root; S.pos.legal(root); U64 tot = 0;
        for (Move m : root) { S.pos.make(m); U64 n = perft(S.pos, perft_d - 1); S.pos.unmake(m); tot += n; printf("%s: %llu\n", move_str(m).c_str(), (unsigned long long)n); }
        printf("Nodes searched: %llu\n", (unsigned long long)tot); fflush(stdout);
        continue;
      }
      double soft = -1, hard = -1;
      if (l.movetime >= 0) { hard = std::max(1.0, l.movetime - overhead_ms); soft = hard * 0.55; }
      else if (!l.infinite && (l.wtime >= 0 || l.btime >= 0)) {
        long long t_left = S.pos.side == WHITE ? l.wtime : l.btime, inc = S.pos.side == WHITE ? l.winc : l.binc;
        int mtg = l.movestogo > 0 ? (int)l.movestogo : 30;
        double base = (double)t_left / std::max(mtg, 8) + inc * 0.75;
        hard = std::max(1.0, std::min(base * 2.5, t_left * 0.25) - overhead_ms);
        soft = std::max(1.0, std::min(base, t_left * 0.25) - overhead_ms) * 0.6;
      }
      double mult = plan_observe(S.pos, game_moves);
      S.plan_hint = 0;
      if (PLAN_MEMORY) {
        if (PLAN.status == "ON_TRACK") S.plan_hint = PLAN.next_move;
        if (soft > 0) soft = std::min(soft * mult, hard > 0 ? hard * 0.8 : soft * mult);  // hard deadline never extended
      }
      S.stop = false;
      worker = std::thread([&S, l, soft, hard, &out_mu]() {
        int d;
        Move m = S.think(l, soft, hard, true, d);
        plan_record(S, m, d);
        plan_print();
        std::lock_guard<std::mutex> g(out_mu);
        if (getenv("CHIMERA_TRACE")) fprintf(stderr, "trace internal_ms %.2f nodes %lld depth %d\n", std::chrono::duration<double, std::milli>(Clock::now() - S.start).count(), S.nodes, d);
        printf("bestmove %s\n", move_str(m).c_str()); fflush(stdout);
      });
    } else if (cmd == "stop") { S.stop = true; join(); }
    else if (cmd == "quit") { S.stop = true; join(); break; }
    else if (cmd == "d") { printf("hash %016llx side %d castle %d ep %d half %d\n", (unsigned long long)S.pos.hash, S.pos.side, S.pos.castle, S.pos.ep, S.pos.half); fflush(stdout); }
    else if (cmd == "eval") { printf("eval %d\n", evaluate(S.pos)); fflush(stdout); }
  }
  join();
  return 0;
}
