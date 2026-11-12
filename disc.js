// Disc access for CHD (v5, CD codecs cdlz/cdzl + uncompressed/self hunks) and BIN images.
// Disc.open(read, size, name) -> disc with .sector(lba) -> Promise<Uint8Array(2352)>, .readFile(path), .files
(function (root) {
  const isNode = typeof module !== 'undefined';
  const CP = isNode ? require('./chdpatch.js') : root.CHDPatch;
  const LZ = isNode ? require('./lzma.js') : root.LZMA;
  const FL = isNode ? require('./flac.js') : root.FLAC;
  const be = (d, o, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + d[o + i]; return v; };
  async function inflateRaw(u8) {
    if (isNode) return new Uint8Array(require('zlib').inflateRawSync(u8));
    const ds = new DecompressionStream('deflate-raw');
    const r = new Response(new Blob([u8]).stream().pipeThrough(ds));
    return new Uint8Array(await r.arrayBuffer());
  }
  const FRAME = 2448, SEC = 2352;
  const SYNC = new Uint8Array([0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0]);
  // CD-ROM EDC/ECC (mode 2)
  const EDCECC = (() => {
    const ecc_f = new Uint8Array(256), ecc_b = new Uint8Array(256), lut = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { const j = ((i << 1) ^ (i & 0x80 ? 0x11d : 0)) & 0xff; ecc_f[i] = j; ecc_b[i ^ j] = i;
      let e = i; for (let k = 0; k < 8; k++) e = (e >>> 1) ^ (e & 1 ? 0xd8018001 : 0); lut[i] = e >>> 0; }
    const edc = (d, a, n) => { let e = 0; for (let i = a; i < a + n; i++) e = (e >>> 8) ^ lut[(e ^ d[i]) & 0xff]; return e >>> 0; };
    function eccPart(sec, majc, minc, majm, mininc, dst) {
      const size = majc * minc;
      for (let maj = 0; maj < majc; maj++) {
        let idx = (maj >> 1) * majm + (maj & 1), a = 0, b = 0;
        for (let mi = 0; mi < minc; mi++) { const t = sec[0xc + idx]; idx += mininc; if (idx >= size) idx -= size; a ^= t; b ^= t; a = ecc_f[a]; }
        a = ecc_b[ecc_f[a] ^ b]; sec[dst + maj] = a; sec[dst + maj + majc] = a ^ b;
      }
    }
    function ecc(sec) { // mode 2 form 1 parity (header counts as zero)
      const hdr = sec.slice(0xc, 0x10); sec.fill(0, 0xc, 0x10);
      eccPart(sec, 86, 24, 2, 86, 0x81c); eccPart(sec, 52, 43, 86, 88, 0x8c8); sec.set(hdr, 0xc);
    }
    function fix(sec) { // EDC + ECC of a mode 2 sector (form from the subheader)
      if (sec[0x12] & 0x20) { const e = edc(sec, 0x10, 8 + 2324); sec[0x92c] = e; sec[0x92d] = e >>> 8; sec[0x92e] = e >>> 16; sec[0x92f] = e >>> 24; }
      else { const e = edc(sec, 0x10, 8 + 2048); sec[0x818] = e; sec[0x819] = e >>> 8; sec[0x81a] = e >>> 16; sec[0x81b] = e >>> 24; ecc(sec); }
    }
    return { edc, ecc, fix };
  })();
  class CHD {
    static async open(read, size) {
      const c = new CHD(); c.read = read; c.size = size;
      const h = await read(0, 124);
      if (String.fromCharCode(...h.subarray(0, 8)) !== 'MComprHD' || be(h, 12, 4) !== 5) throw new Error("ce CHD n'est pas un CHD v5");
      c.hdr = { logical: be(h, 32, 8), mapoffset: be(h, 40, 8), hunkbytes: be(h, 56, 4) };
      c.codecs = [0, 1, 2, 3].map((i) => String.fromCharCode(...h.subarray(16 + 4 * i, 20 + 4 * i)));
      const mh = await read(c.hdr.mapoffset, c.hdr.mapoffset + 16);
      const map = await read(c.hdr.mapoffset, c.hdr.mapoffset + 16 + be(mh, 0, 4));
      c.M = CP.decodeMap(c.hdr, map);
      c.fph = c.hdr.hunkbytes / FRAME; c.cache = new Map();
      // track list (metadata CHT2 / CHTR): CHD frame and disc LBA of each track's index 01
      c.tracks = []; let mo = be(h, 48, 8);
      while (mo) {
        const mh2 = await read(mo, mo + 16), tag = String.fromCharCode(...mh2.subarray(0, 4)), len = be(mh2, 5, 3);
        if (tag === 'CHT2' || tag === 'CHTR') {
          const s = String.fromCharCode(...(await read(mo + 16, mo + 16 + len))).replace(/\0.*$/, ''), g = (k) => (s.match(new RegExp(k + ':(\\S+)')) || [])[1];
          c.tracks.push({ n: +g('TRACK'), type: g('TYPE'), frames: +g('FRAMES'), pregap: +(g('PREGAP') || 0), pgtype: g('PGTYPE') || '', postgap: +(g('POSTGAP') || 0) });
        }
        mo = be(mh2, 8, 8);
      }
      c.tracks.sort((a, b) => a.n - b.n);
      let f = 0, l = 0;
      for (const t of c.tracks) {
        const v = t.pgtype[0] === 'V', pg = t.pregap; if (t.n === 1) l = -pg;
        t.lba = l + pg; t.chd = f + (v ? pg : 0); t.len = t.frames - (v ? pg : 0);
        l = t.lba + t.len + t.postgap; f += t.frames + ((4 - (t.frames % 4)) % 4);
      }
      return c;
    }
    async hunk(i) {
      if (this.cache.has(i)) return this.cache.get(i);
      let t = this.M.type[i], r = i, k = 0;
      while (t === 5 && k++ < 64) { r = this.M.off[r]; t = this.M.type[r]; }
      const src = await this.read(this.M.off[r], this.M.off[r] + this.M.len[r]);
      let out;
      if (t === 4) out = src;
      else {
        const codec = this.codecs[t], n = this.fph, hb = this.hdr.hunkbytes;
        const eccb = (n + 7) >> 3, clb = hb < 65536 ? 2 : 3, hdrb = eccb + clb;
        const cbase = be(src, eccb, clb);
        let base;
        if (codec === 'cdlz') base = LZ.decodeRaw(src.subarray(hdrb, hdrb + cbase), n * SEC);
        else if (codec === 'cdzl') base = await inflateRaw(src.subarray(hdrb, hdrb + cbase));
        else if (codec === 'cdfl') { // CD audio in FLAC (no ECC flags, no length header); samples stored big-endian like the other codecs
          const r = FL.decodeFrames(src, n * SEC / 4); base = new Uint8Array(n * SEC);
          for (let i = 0; i < r.pcm.length; i++) { base[i * 2] = (r.pcm[i] >> 8) & 255; base[i * 2 + 1] = r.pcm[i] & 255; }
          out = new Uint8Array(hb);
          for (let f = 0; f < n; f++) out.set(base.subarray(f * SEC, (f + 1) * SEC), f * FRAME);
          out.eccFlags = new Uint8Array(eccb); out.subSrc = src.subarray(r.consumed).slice(); out.codec = codec;
          if (this.cache.size > 64) this.cache.clear();
          this.cache.set(i, out); return out;
        }
        else throw new Error('codec CHD non géré : ' + codec);
        out = new Uint8Array(hb);
        for (let f = 0; f < n; f++) out.set(base.subarray(f * SEC, (f + 1) * SEC), f * FRAME);
        out.eccFlags = src.subarray(0, eccb).slice();
        out.subSrc = src.subarray(hdrb + cbase).slice(); out.codec = codec;
      }
      if (this.cache.size > 64) this.cache.clear();
      this.cache.set(i, out);
      return out;
    }
    async sector(lba) { const h = Math.floor(lba / this.fph), f = lba % this.fph; return (await this.hunk(h)).subarray(f * FRAME, f * FRAME + SEC); }
    // full raw hunk (frames with sync/ECC rebuilt where the codec stripped them, and the subcode)
    async rawHunk(i) {
      const h = await this.hunk(i); const out = h.slice();
      if (!h.eccFlags) return out;
      let sub;
      if (h.codec === 'cdlz') sub = await inflateRaw(h.subSrc); else sub = await inflateRaw(h.subSrc);
      for (let f = 0; f < this.fph; f++) {
        out.set(sub.subarray(f * 96, (f + 1) * 96), f * FRAME + SEC);
        if (h.eccFlags[f >> 3] & (1 << (f & 7))) {
          const sec = out.subarray(f * FRAME, f * FRAME + SEC);
          sec.set(SYNC, 0); EDCECC.ecc(sec);
        }
      }
      return out;
    }
  }
  class BIN {
    static async open(read, size) { const b = new BIN(); b.read = read; b.size = size; return b; }
    async sector(lba) { return this.read(lba * SEC, (lba + 1) * SEC); }
  }
  async function open(read, size, name) {
    const head = await read(0, 8);
    const d = String.fromCharCode(...head) === 'MComprHD' ? await CHD.open(read, size) : await BIN.open(read, size);
    d.kind = d instanceof CHD ? 'chd' : 'bin';
    d.user = async (lba) => (await d.sector(lba)).subarray(24, 24 + 2048);
    // ISO9660
    const pvd = await d.user(16);
    if (String.fromCharCode(...pvd.subarray(1, 6)) !== 'CD001') throw new Error("pas d'ISO9660 sur ce disque");
    d.files = {};
    const le = (u, o) => u[o] | (u[o + 1] << 8) | (u[o + 2] << 16) | (u[o + 3] << 24);
    async function walk(lba, size, path) {
      for (let k = 0; k < Math.ceil(size / 2048); k++) {
        const s = await d.user(lba + k); let i = 0;
        while (i < 2048) {
          const L = s[i]; if (!L) break;
          const elba = le(s, i + 2) >>> 0, esz = le(s, i + 10) >>> 0, fl = s[i + 25], nl = s[i + 32];
          let nm = String.fromCharCode(...s.subarray(i + 33, i + 33 + nl));
          if (nl === 1 && (s[i + 33] === 0 || s[i + 33] === 1)) { i += L; continue; }
          nm = nm.split(';')[0]; const p = path + '/' + nm;
          d.files[p] = { lba: elba, size: esz, rec: { lba: lba + k, off: i } };
          if (fl & 2) await walk(elba, esz, p);
          i += L;
        }
      }
    }
    await walk(le(pvd, 156 + 2) >>> 0, le(pvd, 156 + 10) >>> 0, '');
    d.readFile = async (p) => {
      const f = d.files[p]; if (!f) throw new Error('fichier absent du disque : ' + p);
      const out = new Uint8Array(Math.ceil(f.size / 2048) * 2048);
      for (let k = 0; k < out.length / 2048; k++) out.set(await d.user(f.lba + k), k * 2048);
      return out.subarray(0, f.size);
    };
    d.name = name;
    // ---- CD audio (the game's music): tracks named after the /CDDA/*.DA entries of the disc when they match
    d.audioTracks = () => {
      const named = Object.entries(d.files).filter(([p]) => /^\/CDDA\/.+\.DA$/i.test(p)).map(([p, e]) => ({ name: p.split('/').pop().replace(/\.DA$/i, ''), lba: e.lba, len: Math.round(e.size / 2048) }));
      const nameOf = (lba) => { const m = named.find((x) => Math.abs(x.lba - lba) <= 225); return m ? m.name : null; };
      if (d.kind === 'chd' && d.tracks.length) return d.tracks.filter((t) => t.type === 'AUDIO').map((t) => ({ n: t.n, name: nameOf(t.lba), frames: t.len, chd: t.chd, lba: t.lba }));
      return named.sort((a, b) => a.lba - b.lba).map((x, i) => ({ n: i + 2, name: x.name, frames: x.len, lba: x.lba }));
    };
    // 16-bit stereo samples (L R L R ...) of a track; onProgress(fraction)
    d.readAudio = async (t, onProgress = () => {}) => {
      const pcm = new Int16Array(t.frames * SEC / 2), le = d.kind !== 'chd';
      for (let k = 0; k < t.frames; k++) {
        const s = await d.sector(t.chd !== undefined ? t.chd + k : t.lba + k), o = k * SEC / 2;
        for (let i = 0; i < SEC / 2; i++) pcm[o + i] = le ? (s[i * 2] | (s[i * 2 + 1] << 8)) << 16 >> 16 : ((s[i * 2] << 8) | s[i * 2 + 1]) << 16 >> 16;
        if (k % 512 === 0) { onProgress(k / t.frames); await new Promise((r) => setTimeout(r, 0)); }
      }
      return pcm;
    };
    // Remix delta patch (see delta/mkdelta.py) -> {lba: {sub, data}}
    d.crc32 = (u8) => { let c = ~0; for (let i = 0; i < u8.length; i++) { c ^= u8[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
    d.applyDelta = async (P, log = () => {}) => {
      const u32 = (o) => (P[o] | (P[o + 1] << 8) | (P[o + 2] << 16) | (P[o + 3] << 24)) >>> 0, u16 = (o) => P[o] | (P[o + 1] << 8);
      if (String.fromCharCode(...P.subarray(0, 4)) !== 'CB2D') throw new Error('bad patch');
      const exe = await d.readFile('/SCES_009.92');
      if (exe.length !== u32(12) || d.crc32(exe) !== u32(8)) { const e = new Error('source'); e.code = 'source'; throw e; }
      const n = u32(16); let o = 20; const mods = {};
      const src = async (addr, len) => { const out = new Uint8Array(len); let k = 0; while (k < len) { const l = Math.floor((addr + k) / 2048), off = (addr + k) % 2048, m = Math.min(len - k, 2048 - off); out.set((await d.user(l)).subarray(off, off + m), k); k += m; } return out; };
      for (let i = 0; i < n; i++) {
        const lba = u32(o), sub = P.slice(o + 4, o + 12), nops = u16(o + 12); o += 14;
        const data = new Uint8Array(2048); let p = 0;
        for (let k = 0; k < nops; k++) { const kind = P[o], len = u16(o + 1); o += 3;
          if (kind === 0) { data.set(await src(u32(o), len), p); o += 4; } else { data.set(P.subarray(o, o + len), p); o += len; } p += len; }
        mods[lba] = { sub, data };
        if (i % 64 === 0) log(i + '/' + n);
      }
      return mods;
    };
    // new image with the given user-data sectors replaced: {lba: Uint8Array(2048)} -> {parts, size}
    // parts = [{a,b} byte ranges of the source | Uint8Array]
    d.build = async (mods, log = () => {}) => {
      const lbas = Object.keys(mods).map(Number).sort((x, y) => x - y);
      const patchSec = (sec, lba) => { const s = sec.slice(), m = mods[lba];
        if (m instanceof Uint8Array) s.set(m, 24); else { s.set(m.sub, 16); s.set(m.data, 24); }
        if (s[0] !== 0 || s[1] !== 255) s.set(SYNC, 0);
        EDCECC.fix(s); return s; };
      if (d.kind === 'bin') {
        const parts = []; let cur = 0;
        for (const l of lbas) { if (l * SEC > cur) parts.push({ a: cur, b: l * SEC }); parts.push(patchSec(await d.sector(l), l)); cur = (l + 1) * SEC; }
        parts.push({ a: cur, b: d.size });
        return { parts, size: d.size };
      }
      const hunks = new Map();
      for (const l of lbas) {
        const hi = Math.floor(l / d.fph), f = l % d.fph;
        if (!hunks.has(hi)) hunks.set(hi, await d.rawHunk(hi));
        const h = hunks.get(hi); h.set(patchSec(h.subarray(f * FRAME, f * FRAME + SEC), l), f * FRAME);
      }
      const H = new Map(); for (const [i, data] of hunks) H.set(i, { crc: CP.crc16(data), data });
      log(hunks.size + ' blocs CHD réécrits');
      return CP.patchHunks(d.read, d.size, H, log);
    };
    return d;
  }
  const api = { open, FRAME, SEC, EDCECC };
  if (isNode) module.exports = api; else root.Disc = api;
})(this);
