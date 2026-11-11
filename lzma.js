// Minimal raw LZMA decoder (no header), after the reference LzmaSpec.cpp.
// decodeRaw(src, outSize, lc=3, lp=0, pb=2) -> Uint8Array(outSize)
(function (root) {
  const kNumBitModelTotalBits = 11, kBitModelTotal = 1 << 11, kNumMoveBits = 5;
  const PROB_INIT = kBitModelTotal >> 1;
  class RC {
    constructor(src) { this.s = src; this.p = 0; this.range = 0xFFFFFFFF; this.code = 0;
      const b = this.s[this.p++]; // first byte must be 0
      for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | this.s[this.p++]) >>> 0;
      if (b !== 0 || this.code === this.range) this.corrupted = true; }
    norm() { if (this.range < 0x1000000) { this.range = (this.range << 8) >>> 0; this.code = ((this.code << 8) | (this.s[this.p++] | 0)) >>> 0; } }
    direct(n) { let res = 0; do { this.range >>>= 1; this.code = (this.code - this.range) >>> 0; const t = 0 - (this.code >>> 31);
      this.code = (this.code + (this.range & t)) >>> 0; res = ((res << 1) + (t + 1)) >>> 0; this.norm(); } while (--n); return res; }
    bit(probs, i) { let v = probs[i]; const bound = ((this.range >>> kNumBitModelTotalBits) * v) >>> 0; let sym;
      if (this.code < bound) { v += (kBitModelTotal - v) >>> kNumMoveBits; this.range = bound; sym = 0; }
      else { v -= v >>> kNumMoveBits; this.code = (this.code - bound) >>> 0; this.range = (this.range - bound) >>> 0; sym = 1; }
      probs[i] = v; this.norm(); return sym; }
  }
  function bitTree(rc, probs, base, numBits) { let m = 1; for (let i = 0; i < numBits; i++) m = (m << 1) + rc.bit(probs, base + m); return m - (1 << numBits); }
  function bitTreeRev(rc, probs, base, numBits) { let m = 1, sym = 0; for (let i = 0; i < numBits; i++) { const b = rc.bit(probs, base + m); m = (m << 1) + b; sym |= b << i; } return sym; }
  const P = (n) => new Uint16Array(n).fill(PROB_INIT);
  class Len {
    constructor() { this.choice = P(2); this.low = P(16 << 3); this.mid = P(16 << 3); this.high = P(256); }
    decode(rc, posState) {
      if (rc.bit(this.choice, 0) === 0) return bitTree(rc, this.low, posState << 3, 3);
      if (rc.bit(this.choice, 1) === 0) return 8 + bitTree(rc, this.mid, posState << 3, 3);
      return 16 + bitTree(rc, this.high, 0, 8);
    }
  }
  function decodeRaw(src, outSize, lc = 3, lp = 0, pb = 2) {
    const out = new Uint8Array(outSize); let op = 0;
    const rc = new RC(src);
    const literal = P(0x300 << (lc + lp));
    const posSlot = P(4 << 6), posDecoders = P(1 + 114), align = P(16);
    const isMatch = P(12 << 4), isRep = P(12), isRepG0 = P(12), isRepG1 = P(12), isRepG2 = P(12), isRep0Long = P(12 << 4);
    const lenDec = new Len(), repLenDec = new Len();
    let rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0, state = 0;
    const pbMask = (1 << pb) - 1, lpMask = (1 << lp) - 1;
    while (op < outSize) {
      const posState = op & pbMask;
      if (rc.bit(isMatch, (state << 4) + posState) === 0) {
        const prev = op > 0 ? out[op - 1] : 0;
        const litState = ((op & lpMask) << lc) + (prev >> (8 - lc));
        const base = 0x300 * litState; let sym = 1;
        if (state >= 7) {
          let matchByte = out[op - rep0 - 1];
          do { const mb = (matchByte >> 7) & 1; matchByte <<= 1; const b = rc.bit(literal, base + ((1 + mb) << 8) + sym); sym = (sym << 1) | b; if (mb !== b) break; } while (sym < 0x100);
        }
        while (sym < 0x100) sym = (sym << 1) | rc.bit(literal, base + sym);
        out[op++] = sym - 0x100;
        state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
        continue;
      }
      let len;
      if (rc.bit(isRep, state) !== 0) {
        if (rc.bit(isRepG0, state) === 0) {
          if (rc.bit(isRep0Long, (state << 4) + posState) === 0) { state = state < 7 ? 9 : 11; out[op] = out[op - rep0 - 1]; op++; continue; }
        } else {
          let dist;
          if (rc.bit(isRepG1, state) === 0) dist = rep1;
          else { if (rc.bit(isRepG2, state) === 0) dist = rep2; else { dist = rep3; rep3 = rep2; } rep2 = rep1; }
          rep1 = rep0; rep0 = dist;
        }
        len = repLenDec.decode(rc, posState);
        state = state < 7 ? 8 : 11;
      } else {
        rep3 = rep2; rep2 = rep1; rep1 = rep0;
        len = lenDec.decode(rc, posState);
        state = state < 7 ? 7 : 10;
        // distance
        const lenState = Math.min(len, 3);
        const ps = bitTree(rc, posSlot, lenState << 6, 6);
        if (ps < 4) rep0 = ps;
        else {
          const numDirect = (ps >> 1) - 1; let dist = ((2 | (ps & 1)) << numDirect) >>> 0;
          if (ps < 14) dist = (dist + bitTreeRev(rc, posDecoders, dist - ps, numDirect)) >>> 0;
          else { dist = (dist + (rc.direct(numDirect - 4) << 4)) >>> 0; dist = (dist + bitTreeRev(rc, align, 0, 4)) >>> 0; }
          rep0 = dist;
          if (rep0 === 0xFFFFFFFF) break; // end marker
        }
      }
      len += 2;
      for (let i = 0; i < len && op < outSize; i++) { out[op] = out[op - rep0 - 1]; op++; }
    }
    return out;
  }
  const api = { decodeRaw };
  if (typeof module !== 'undefined') module.exports = api; else root.LZMA = api;
})(this);
