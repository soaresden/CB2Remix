// Minimal FLAC frame decoder, for the CD audio blocks of CHD files (codec "cdfl": FLAC frames without the "fLaC"
// header, 2 channels, 16 bits, 44.1 kHz). decodeFrames(src, samplesPerChannel) -> {pcm: Int16Array (L R L R ...), consumed}
(function (root) {
  class Bits {
    constructor(b) { this.b = b; this.p = 0; } // p = bit position
    read(n) { // n <= 32
      let v = 0;
      while (n > 0) {
        const byte = this.b[this.p >> 3], off = this.p & 7, take = Math.min(8 - off, n);
        v = v * (1 << take) + ((byte >> (8 - off - take)) & ((1 << take) - 1));
        this.p += take; n -= take;
      }
      return v;
    }
    signed(n) { const v = this.read(n); return n && v >= 2 ** (n - 1) ? v - 2 ** n : v; }
    unary() { // number of 0 bits before the next 1
      let q = 0;
      for (;;) {
        const off = this.p & 7, byte = (this.b[this.p >> 3] << off) & 0xff;
        if (byte) { const z = Math.clz32(byte) - 24; q += z; this.p += z + 1; return q; }
        q += 8 - off; this.p += 8 - off;
        if (this.p >> 3 >= this.b.length) throw new Error('FLAC : fin de données inattendue');
      }
    }
    align() { this.p = (this.p + 7) & ~7; }
  }
  const BS = [0, 192, 576, 1152, 2304, 4608, 0, 0, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
  const SS = [16, 8, 12, 0, 16, 20, 24, 0];
  function residual(br, out, n, order) {
    const method = br.read(2), pb = method === 0 ? 4 : 5, esc = method === 0 ? 15 : 31, po = br.read(4), parts = 1 << po;
    let i = order;
    for (let p = 0; p < parts; p++) {
      const cnt = (n >> po) - (p === 0 ? order : 0), k = br.read(pb);
      if (k === esc) { const bits = br.read(5); for (let j = 0; j < cnt; j++) out[i++] = br.signed(bits); continue; }
      for (let j = 0; j < cnt; j++) { const q = br.unary(), u = q * (1 << k) + (k ? br.read(k) : 0); out[i++] = u & 1 ? -((u + 1) / 2) : u / 2; }
    }
  }
  function subframe(br, n, bps) {
    br.read(1); const type = br.read(6); let wasted = 0;
    if (br.read(1)) wasted = br.unary() + 1;
    bps -= wasted;
    const s = new Float64Array(n);
    if (type === 0) { const v = br.signed(bps); s.fill(v); }
    else if (type === 1) { for (let i = 0; i < n; i++) s[i] = br.signed(bps); }
    else if (type >= 8 && type <= 12) {
      const o = type - 8; for (let i = 0; i < o; i++) s[i] = br.signed(bps);
      residual(br, s, n, o);
      for (let i = o; i < n; i++) {
        if (o === 1) s[i] += s[i - 1];
        else if (o === 2) s[i] += 2 * s[i - 1] - s[i - 2];
        else if (o === 3) s[i] += 3 * s[i - 1] - 3 * s[i - 2] + s[i - 3];
        else if (o === 4) s[i] += 4 * s[i - 1] - 6 * s[i - 2] + 4 * s[i - 3] - s[i - 4];
      }
    } else if (type >= 32) {
      const o = type - 31; for (let i = 0; i < o; i++) s[i] = br.signed(bps);
      const prec = br.read(4) + 1, shift = br.signed(5), c = []; for (let i = 0; i < o; i++) c.push(br.signed(prec));
      residual(br, s, n, o);
      const d = 2 ** shift;
      for (let i = o; i < n; i++) { let sum = 0; for (let j = 0; j < o; j++) sum += c[j] * s[i - 1 - j]; s[i] += Math.floor(sum / d); }
    } else throw new Error('FLAC : sous-trame inconnue ' + type);
    if (wasted) for (let i = 0; i < n; i++) s[i] *= 2 ** wasted;
    return s;
  }
  function decodeFrames(src, total) {
    const br = new Bits(src), pcm = new Int16Array(total * 2); let done = 0;
    while (done < total) {
      if (br.read(14) !== 0x3ffe) throw new Error('FLAC : synchro de trame introuvable');
      br.read(2);
      const bsc = br.read(4), src_ = br.read(4), ch = br.read(4), ssc = br.read(3); br.read(1);
      // frame / sample number, UTF-8 style
      let x = br.read(8), extra = 0; while (x & 0x80) { extra++; x = (x << 1) & 0xff; } for (let k = 1; k < extra; k++) br.read(8);
      let n = BS[bsc]; if (bsc === 1) n = 192; if (bsc === 6) n = br.read(8) + 1; else if (bsc === 7) n = br.read(16) + 1;
      if (src_ === 12) br.read(8); else if (src_ === 13 || src_ === 14) br.read(16);
      br.read(8); // header CRC-8
      const bps = SS[ssc] || 16, nch = ch < 8 ? ch + 1 : 2;
      const chans = [];
      for (let c = 0; c < nch; c++) chans.push(subframe(br, n, bps + ((ch === 8 && c === 1) || (ch === 9 && c === 0) || (ch === 10 && c === 1) ? 1 : 0)));
      br.align(); br.read(16); // frame CRC-16
      let L = chans[0], R = nch > 1 ? chans[1] : chans[0];
      if (ch === 8) { R = new Float64Array(n); for (let i = 0; i < n; i++) R[i] = L[i] - chans[1][i]; }
      else if (ch === 9) { L = new Float64Array(n); for (let i = 0; i < n; i++) L[i] = chans[0][i] + chans[1][i]; }
      else if (ch === 10) { L = new Float64Array(n); R = new Float64Array(n);
        for (let i = 0; i < n; i++) { const side = chans[1][i], mid = chans[0][i] * 2 + (side & 1); L[i] = (mid + side) / 2; R[i] = (mid - side) / 2; } }
      const m = Math.min(n, total - done);
      for (let i = 0; i < m; i++) { pcm[(done + i) * 2] = L[i]; pcm[(done + i) * 2 + 1] = R[i]; }
      done += m;
    }
    return { pcm, consumed: br.p >> 3 };
  }
  const api = { decodeFrames };
  if (typeof module !== 'undefined') module.exports = api; else root.FLAC = api;
})(this);
