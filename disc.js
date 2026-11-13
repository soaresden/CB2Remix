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
    // reads go through a 4 MB window: consecutive hunks are stored one after the other, and each read of the
    // player's file is slow on phones (thousands of small reads per music track otherwise)
    async readc(a, b) {
      const W = this.win;
      if (W && a >= W.a && b <= W.a + W.d.length) return W.d.subarray(a - W.a, b - W.a);
      const e = Math.min(this.size, Math.max(b, a + (1 << 22)));
      const d = await this.read(a, e); this.win = { a, d }; return d.subarray(0, b - a);
    }
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
      c.tracks = []; c.meta = []; c.head = h; let mo = be(h, 48, 8);
      while (mo) {
        const mh2 = await read(mo, mo + 16), tag = String.fromCharCode(...mh2.subarray(0, 4)), len = be(mh2, 5, 3);
        c.meta.push({ tag: mh2.slice(0, 4), flags: mh2[4], data: (await read(mo + 16, mo + 16 + len)).slice() });
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
      const src = await this.readc(this.M.off[r], this.M.off[r] + this.M.len[r]);
      let out;
      if (t === 4) out = src.slice();
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
    // executable named by SYSTEM.CNF (SCES_009.92 in Europe, SCUS_943.58 in the USA)
    d.bootExe = async () => { try { const m = new TextDecoder().decode(await d.readFile('/SYSTEM.CNF')).match(/BOOT\s*=\s*cdrom:\\?([^;\s]+)/i); if (m) return '/' + m[1].replace(/^\\/, ''); } catch (e) {} return '/SCES_009.92'; };
    // ---- CD audio (the game's music): tracks named after the /CDDA/*.DA entries of the disc when they match
    d.audioTracks = () => {
      const named = Object.entries(d.files).filter(([p]) => /^\/CDDA\/.+\.DA$/i.test(p)).map(([p, e]) => ({ name: p.split('/').pop().replace(/\.DA$/i, ''), lba: e.lba, len: Math.round(e.size / 2048) }));
      const nameOf = (lba) => { const m = named.find((x) => Math.abs(x.lba - lba) <= 225); return m ? m.name : null; };
      if (d.kind === 'chd' && d.tracks.length) return d.tracks.filter((t) => t.type === 'AUDIO').map((t) => ({ n: t.n, name: nameOf(t.lba), frames: t.len, chd: t.chd, lba: t.lba }));
      return named.sort((a, b) => a.lba - b.lba).map((x, i) => ({ n: i + 2, name: x.name, frames: x.len, lba: x.lba }));
    };
    // ---- soundtrack of another disc (Cool Boarders 2 USA): this disc's data track (with `mods`, e.g. the Remix) +
    // every audio track of `us`, copied as stored; /CDDA/BGMx.DA point at the tracks given by mapping (BGMA = 2).
    // -> {parts: [Uint8Array | {a, b, f}], size}, f = 0 this file, 1 the other disc's file
    d.composeSoundtrack = async (us, mods, mapping, log = () => {}) => {
      if (d.kind !== 'chd' || us.kind !== 'chd') throw new Error('les deux disques doivent être des CHD');
      if (d.hdr.hunkbytes !== us.hdr.hunkbytes || d.codecs.join() !== us.codecs.join()) throw new Error('les deux CHD ne sont pas compressés de la même façon');
      const isT = (m) => /^CHT[2R]$/.test(String.fromCharCode(...m.tag)), txt = (m) => String.fromCharCode(...m.data).replace(/\0.*$/s, '');
      const ta = d.meta.filter(isT), tb = us.meta.filter(isT);
      const a1 = +txt(ta[0]).match(/FRAMES:(\d+)/)[1], b1 = +txt(tb[0]).match(/FRAMES:(\d+)/)[1], start = b1 + ((4 - (b1 % 4)) % 4), fph = d.fph;
      if (start % fph || a1 > b1) throw new Error('disposition des pistes inattendue');
      const H0 = start / fph, N = us.M.hunkcount;
      mods = Object.assign({}, mods);
      const userOf = async (l) => { const m = mods[l]; return (m ? (m instanceof Uint8Array ? m : m.data) : await d.user(l)).slice(); };
      const C = d.files['/CDDA'];
      for (let k = 0; k < Math.ceil(C.size / 2048); k++) {
        const s = await userOf(C.lba + k); let i = 0;
        while (i < 2048 && s[i]) {
          const L = s[i], nl = s[i + 32], name = String.fromCharCode(...s.subarray(i + 33, i + 33 + nl)).split(';')[0];
          const mm = name.match(/^BGM([A-Z])\.DA$/), n = mm ? mm[1].charCodeAt(0) - 63 : 0, t = mapping[n], src = t && us.files['/CDDA/BGM' + String.fromCharCode(t + 63) + '.DA'];
          if (src) { const dv = new DataView(s.buffer, s.byteOffset); dv.setUint32(i + 2, src.lba, true); dv.setUint32(i + 6, src.lba, false); dv.setUint32(i + 10, src.size, true); dv.setUint32(i + 14, src.size, false);
            log(name + ' → piste US BGM' + String.fromCharCode(t + 63)); }
          i += L;
        }
        const old = mods[C.lba + k]; mods[C.lba + k] = old && !(old instanceof Uint8Array) ? { sub: old.sub, data: s } : s;
      }
      const bcd = (x) => ((x / 10) | 0) * 16 + (x % 10), hunks = new Map();
      const raw = async (hi) => { if (!hunks.has(hi)) hunks.set(hi, await d.rawHunk(hi)); return hunks.get(hi); };
      for (const l of Object.keys(mods).map(Number)) {
        const hi = Math.floor(l / fph), f = l % fph, h = await raw(hi), sec = h.slice(f * FRAME, f * FRAME + SEC), m = mods[l];
        if (m instanceof Uint8Array) sec.set(m, 24); else { sec.set(m.sub, 16); sec.set(m.data, 24); }
        if (sec[0] !== 0 || sec[1] !== 255) sec.set(SYNC, 0);
        EDCECC.fix(sec); h.set(sec, f * FRAME);
      }
      for (let hi = Math.floor(a1 / fph); hi < H0; hi++) {         // the data track grows to the USA length
        const h = await raw(hi);
        for (let f = 0; f < fph; f++) { const fr = hi * fph + f; if (fr < a1) continue; h.fill(0, f * FRAME, (f + 1) * FRAME);
          if (fr < b1) { const s = new Uint8Array(SEC), a = fr + 150; s.set(SYNC, 0); s[12] = bcd((a / 4500) | 0); s[13] = bcd(((a / 75) | 0) % 60); s[14] = bcd(a % 75); s[15] = 2; EDCECC.fix(s); h.set(s, f * FRAME); } }
      }
      const entries = new Array(N);
      for (let i = 0; i < N; i++) entries[i] = hunks.has(i) ? { data: hunks.get(i) } : i < H0 ? { src: 0, M: d.M, i } : { src: 1, M: us.M, i };
      const enc = new TextEncoder(), meta = d.meta.filter((m) => !isT(m)).concat([{ tag: ta[0].tag, flags: ta[0].flags, data: enc.encode(txt(ta[0]).replace(/FRAMES:\d+/, 'FRAMES:' + b1) + '\0') }], tb.slice(1));
      log(H0 + ' blocs du jeu européen, ' + (N - H0) + ' blocs de musique du disque américain');
      return CP.composeChd(d.head, d.hdr.hunkbytes, entries, meta, d.M.parentbits);
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
      const exe = await d.readFile(await d.bootExe());
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
    // ---- PS1 movie frames (mod crew): STR, MDEC bitstream version 2 -> RGB, integer only (same pixels as modular.py)
    const MZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21,
      28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
    const MQT = [2, 16, 19, 22, 26, 27, 29, 34, 16, 16, 22, 24, 27, 29, 34, 37, 19, 22, 26, 27, 29, 34, 34, 38, 22, 22, 26, 27,
      29, 34, 37, 40, 22, 26, 27, 29, 32, 35, 40, 48, 26, 27, 29, 32, 35, 40, 48, 58, 26, 27, 29, 34, 38, 46, 56, 69,
      27, 29, 35, 38, 46, 56, 69, 83];
    const MB = [2896, 2896, 2896, 2896, 2896, 2896, 2896, 2896, 4017, 3406, 2276, 799, -799, -2276, -3406, -4017,
      3784, 1567, -1567, -3784, -3784, -1567, 1567, 3784, 3406, -799, -4017, -2276, 2276, 4017, 799, -3406,
      2896, -2896, -2896, 2896, 2896, -2896, -2896, 2896, 2276, -4017, 799, 3406, -3406, -799, 4017, -2276,
      1567, -3784, 3784, -1567, -1567, 3784, -3784, 1567, 799, -2276, 3406, -4017, 4017, -3406, 2276, -799];
    const MAC = new Map();
    '11 0 1|011 1 1|0100 0 2|0101 2 1|00101 0 3|00111 3 1|00110 4 1|000110 1 2|000111 5 1|000101 6 1|000100 7 1|0000110 0 4|0000100 2 2|0000111 8 1|0000101 9 1|00100110 0 5|00100001 0 6|00100101 1 3|00100100 3 2|00100111 10 1|00100011 11 1|00100010 12 1|00100000 13 1|0000001010 0 7|0000001100 1 4|0000001011 2 3|0000001111 4 2|0000001001 5 2|0000001110 14 1|0000001101 15 1|0000001000 16 1|000000011101 0 8|000000011000 0 9|000000010011 0 10|000000010000 0 11|000000011011 1 5|000000010100 2 4|000000011100 3 3|000000010010 4 3|000000011110 6 2|000000010101 7 2|000000010001 8 2|000000011111 17 1|000000011010 18 1|000000011001 19 1|000000010111 20 1|000000010110 21 1|0000000011010 0 12|0000000011001 0 13|0000000011000 0 14|0000000010111 0 15|0000000010110 1 6|0000000010101 1 7|0000000010100 2 5|0000000010011 3 4|0000000010010 5 3|0000000010001 9 2|0000000010000 10 2|0000000011111 22 1|0000000011110 23 1|0000000011101 24 1|0000000011100 25 1|0000000011011 26 1|00000000011111 0 16|00000000011110 0 17|00000000011101 0 18|00000000011100 0 19|00000000011011 0 20|00000000011010 0 21|00000000011001 0 22|00000000011000 0 23|00000000010111 0 24|00000000010110 0 25|00000000010101 0 26|00000000010100 0 27|00000000010011 0 28|00000000010010 0 29|00000000010001 0 30|00000000010000 0 31|000000000011000 0 32|000000000010111 0 33|000000000010110 0 34|000000000010101 0 35|000000000010100 0 36|000000000010011 0 37|000000000010010 0 38|000000000010001 0 39|000000000010000 0 40|000000000011111 1 8|000000000011110 1 9|000000000011101 1 10|000000000011100 1 11|000000000011011 1 12|000000000011010 1 13|000000000011001 1 14|0000000000010011 1 15|0000000000010010 1 16|0000000000010001 1 17|0000000000010000 1 18|0000000000010100 6 3|0000000000011010 11 2|0000000000011001 12 2|0000000000011000 13 2|0000000000010111 14 2|0000000000010110 15 2|0000000000010101 16 2|0000000000011111 27 1|0000000000011110 28 1|0000000000011101 29 1|0000000000011100 30 1|0000000000011011 31 1'.split('|').forEach((e) => { const [c, r, l] = e.split(' '); MAC.set(c.length * 65536 + parseInt(c, 2), [+r, +l]); });
    const mdecFrame = async (sector, nsec, n) => {
      const parts = new Map();
      for (let k = 0; k < nsec; k++) {
        const s = await sector(k);
        if (s[0] !== 0x60 || s[1] !== 1 || s[2] !== 1 || s[3] !== 0x80) continue;
        const chunk = s[4] | s[5] << 8, fr = (s[8] | s[9] << 8 | s[10] << 16 | s[11] << 24) >>> 0;
        if (fr === n) parts.set(chunk, s.slice(32, 2048)); else if (fr > n && parts.size) break;
      }
      const keys = [...parts.keys()].sort((a, b) => a - b), out = new Uint8Array(keys.length * 2016);
      keys.forEach((k, i) => out.set(parts.get(k), i * 2016)); return out;
    };
    const signed = (v, n) => (v >> (n - 1) ? v - (1 << n) : v);
    const mdecDecode = (bs, w, h, x0, y0, x1, y1) => {
      const q = bs[4] | bs[5] << 8, ver = bs[6] | bs[7] << 8; if (ver !== 2) throw new Error('STR v' + ver);
      let p = 8, acc = 0, nb = 0;
      const peek = (n) => { while (nb < n) { const wd = p + 1 < bs.length ? bs[p] | bs[p + 1] << 8 : 0; p += 2; acc = ((acc << 16) | wd) >>> 0; nb += 16; } return (acc >>> (nb - n)) & ((1 << n) - 1); };
      const get = (n) => { const v = peek(n); nb -= n; acc = nb ? acc & ((2 ** nb) - 1) : 0; return v; };
      const block = (idct) => {
        const c = new Array(64).fill(0);
        c[0] = Math.max(-1024, Math.min(1023, signed(get(10), 10) * MQT[0]));
        let k = 0;
        for (;;) {
          if (peek(2) === 2) { get(2); break; }
          let run, lev;
          if (peek(6) === 1) { get(6); run = get(6); lev = signed(get(10), 10); }
          else {
            let e = null, ln = 2;
            for (; ln <= 16; ln++) { e = MAC.get(ln * 65536 + peek(ln)); if (e) break; }
            if (!e) throw new Error('MDEC: code inconnu');
            get(ln); [run, lev] = e; if (get(1)) lev = -lev;
          }
          k += run + 1; if (k > 63) throw new Error('MDEC: bloc trop long');
          const z = MZZ[k]; c[z] = Math.max(-1024, Math.min(1023, (lev * MQT[z] * q + 4) >> 3));
        }
        if (!idct) return c;
        const t = new Array(64), o = new Array(64);
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { let s = 0; for (let u = 0; u < 8; u++) { const r = c[y * 8 + u]; if (r) s += MB[u * 8 + x] * r; } t[y * 8 + x] = (s + 1024) >> 11; }
        for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) { let s = 0; for (let v = 0; v < 8; v++) s += MB[v * 8 + y] * t[v * 8 + x]; o[y * 8 + x] = (s + 16384) >> 15; }
        return o;
      };
      const img = []; for (let y = 0; y < h; y++) img.push(new Uint8Array(w * 3));
      const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
      for (let mx = 0; mx < w; mx += 16) for (let my = 0; my < h; my += 16) {
        const use = !(mx + 16 <= x0 || mx >= x1 || my + 16 <= y0 || my >= y1);
        const cr = block(use), cb = block(use), ys = [block(use), block(use), block(use), block(use)];
        if (!use) continue;
        for (let yy = 0; yy < 16; yy++) { const row = img[my + yy];
          for (let xx = 0; xx < 16; xx++) {
            const yv = ys[(yy >> 3) * 2 + (xx >> 3)][(yy & 7) * 8 + (xx & 7)] + 128, k = (yy >> 1) * 8 + (xx >> 1), r = cr[k], b = cb[k], o = (mx + xx) * 3;
            row[o] = cl(yv + ((359 * r + 128) >> 8)); row[o + 1] = cl(yv - ((88 * b + 183 * r + 128) >> 8)); row[o + 2] = cl(yv + ((454 * b + 128) >> 8));
          } }
      }
      return img;
    };
    const medianCut = (pixels, n) => {
      const lex = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      const boxes = [pixels.slice().sort(lex)];
      while (boxes.length < n) {
        let best = -1, br = 0, bc = 0;
        boxes.forEach((bx, i) => { if (bx.length < 2) return;
          for (let c = 0; c < 3; c++) { let lo = 1e9, hi = -1; for (const q of bx) { if (q[c] < lo) lo = q[c]; if (q[c] > hi) hi = q[c]; } if (hi - lo > br) { br = hi - lo; best = i; bc = c; } } });
        if (best < 0) break;
        const bx = boxes[best].slice().sort((a, b) => a[bc] - b[bc] || lex(a, b)), m = bx.length >> 1;
        boxes.splice(best, 1, bx.slice(0, m), bx.slice(m));
      }
      return boxes.map((bx) => { const s = [0, 0, 0]; for (const q of bx) { s[0] += q[0]; s[1] += q[1]; s[2] += q[2]; } return s.map((v) => Math.floor(v / bx.length)); });
    };
    const face = async (sector, nsec, [fr, x0, y0, w, h, white], ncol) => {
      const img = mdecDecode(await mdecFrame(sector, nsec, fr), 320, 240, x0, y0, x0 + w, y0 + h);
      const px = (x, y) => { const r = img[y0 + y], o = (x0 + x) * 3; return [r[o], r[o + 1], r[o + 2]]; };
      const isbg = (c) => { const lo = Math.min(...c), hi = Math.max(...c); return white ? lo >= 236 && hi - lo <= 16 : hi <= 48; };
      const fringe = (c) => { const lo = Math.min(...c), hi = Math.max(...c); return white ? lo >= 196 && hi - lo <= 40 : hi <= 72; };
      const bg = new Uint8Array(w * h), stack = [];
      for (let x = 0; x < w; x++) stack.push([x, 0], [x, h - 1]);
      for (let y = 0; y < h; y++) stack.push([0, y], [w - 1, y]);
      while (stack.length) { const [x, y] = stack.pop(); if (bg[y * w + x] || !isbg(px(x, y))) continue; bg[y * w + x] = 1;
        if (x > 0) stack.push([x - 1, y]); if (x < w - 1) stack.push([x + 1, y]); if (y > 0) stack.push([x, y - 1]); if (y < h - 1) stack.push([x, y + 1]); }
      for (let it = 0; it < 2; it++) { const add = [];   // the halo next to the background goes too
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!bg[y * w + x] && fringe(px(x, y)) &&
          ((x > 0 && bg[y * w + x - 1]) || (x < w - 1 && bg[y * w + x + 1]) || (y > 0 && bg[(y - 1) * w + x]) || (y < h - 1 && bg[(y + 1) * w + x]))) add.push(y * w + x);
        for (const i of add) bg[i] = 1; }
      let small = [];
      for (let dy = 0; dy < 64; dy++) { const sy0 = Math.floor(dy * h / 64), sy1 = Math.floor((dy + 1) * h / 64);
        for (let dx = 0; dx < 64; dx++) { const sx0 = Math.floor(dx * w / 64), sx1 = Math.floor((dx + 1) * w / 64); let r = 0, g = 0, b = 0, c = 0, t = 0;
          for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { t++; if (bg[y * w + x]) continue; const q = px(x, y); r += q[0]; g += q[1]; b += q[2]; c++; }
          small.push(c === 0 || c * 2 < t ? null : [Math.floor(r / c), Math.floor(g / c), Math.floor(b / c)]); } }
      for (let it = 0; it < 2; it++) { const nxt = small.slice();   // specks
        for (let i = 0; i < 4096; i++) { if (!small[i]) continue; const x = i % 64, y = i >> 6;
          const on = (x > 0 && !!small[i - 1]) + (x < 63 && !!small[i + 1]) + (y > 0 && !!small[i - 64]) + (y < 63 && !!small[i + 64]); if (on <= 1) nxt[i] = null; }
        small = nxt; }
      const ink = []; for (let i = 0; i < 4096; i++) if (!small[i] && ((i % 64 > 0 && small[i - 1]) || (i % 64 < 63 && small[i + 1]) || (i >= 64 && small[i - 64]) || (i < 4032 && small[i + 64]))) ink.push(i);
      const pal = medianCut(small.filter((q) => q), ncol - 2);
      const idx = small.map((q) => { if (!q) return 0; let best = 0, bd = 1 << 30;
        pal.forEach((c, i) => { const d2 = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2; if (d2 < bd) { bd = d2; best = i; } }); return best + 1; });
      for (const i of ink) idx[i] = pal.length + 1;   // dark outline
      const clut = [0, ...pal.map((c) => ((c[0] >> 3) | (c[1] >> 3) << 5 | (c[2] >> 3) << 10) || 0x8000), 0x0842];
      while (clut.length < ncol) clut.push(0);
      return [idx, clut];
    };
    // ['face', fbd, movie, {cards, face, clut, n}]: portraits from the player's own movie (see modular.face_op)
    d.faceOp = async (fbd, sector, nsec, op) => {
      const p = op[3], [fx, fy] = p.face, [cx, cy] = p.clut, n = p.n, vo = (x, y) => 20 + (y * 704 + x - 320) * 2;
      for (let k = 0; k < p.cards.length; k++) {
        const [idx, clut] = await face(sector, nsec, p.cards[k], n);
        for (let y = 0; y < 64; y++) fbd.set(idx.slice(y * 64, (y + 1) * 64), vo(fx + 32 * k, fy + y));
        const o = vo(cx, cy + k); clut.forEach((v, i) => { fbd[o + 2 * i] = v & 255; fbd[o + 2 * i + 1] = v >> 8; });
      }
    };
    // ['crewmenu', lba, archive, fbd, p] (mod crew): menu model of a CPU rider from its ending model (see modular.crew_menu_chunk)
    d.crewMenuChunk = (archive, fbd, p) => {
      const dv = new DataView(archive.buffer, archive.byteOffset, archive.length);
      const n0 = dv.getUint32(4, true), t = archive.subarray(n0 * 4, 4 * dv.getUint32(8, true)), tv = new DataView(t.buffer, t.byteOffset, t.length);
      const u32 = (o) => tv.getUint32(o, true), n = u32(8), parts = [];
      for (let i = 0; i < n; i++) {
        const b = 12 + 28 * i, vt = u32(b), nv = u32(b + 4), nt = u32(b + 8), nn = u32(b + 12), pt = u32(b + 16), np = u32(b + 20);
        const verts = []; for (let j = 0; j < nv; j++) { const o = 12 + vt + 8 * j; verts.push([tv.getInt16(o, true), tv.getInt16(o + 2, true), tv.getInt16(o + 4, true), tv.getInt16(o + 6, true)]); }
        const norms = t.slice(12 + nt, 12 + nt + 8 * nn), prims = []; let o = 12 + pt;
        for (let j = 0; j < np; j++) { const ilen = t[o + 1], w = []; for (let q = 0; q <= ilen; q++) w.push(u32(o + 4 * q)); prims.push(w); o += 4 + 4 * ilen; }
        if (!prims.some((w) => (w[0] >>> 24) & 4 && ((w[2] >>> 16) & 0x1f) === 5)) parts.push([verts, norms, prims]);
      }
      const col = p.col, ncba = (768 >> 4) | (p.cly << 6), out = [];
      for (const group of p.parts) {
        const V = [], N = [], P = [];
        for (const gi of group) {
          const [verts, norms, prims] = parts[gi], vo = V.length, no = N.reduce((a, x) => a + x.length, 0) / 8;
          for (const [x, y, z, q] of verts) V.push([x, y + p.yshift, z, q]); N.push(norms);
          for (const w0 of prims) {
            const w = w0.slice(), mode = (w[0] >>> 24) & 0xff;
            for (const [wi, half, kind] of p.idx[mode]) {
              const sh = 16 * half, val = ((w[wi] >>> sh) & 0xffff) + (kind === 'v' ? vo : no);
              w[wi] = half ? ((w[wi] & 0xffff) | (val << 16)) >>> 0 : ((w[wi] & 0xffff0000) | val) >>> 0;
            }
            if (mode & 4) { w[1] = ((w[1] & 0xffff) | (ncba << 16)) >>> 0; w[2] = ((w[2] & 0xffff) | (((((w[2] >>> 16) & 0xffff) & ~0x1f) | (col >> 6)) << 16)) >>> 0; }
            P.push(w);
          }
        }
        out.push([V, N, P]);
      }
      const hdr = 12 + 28 * out.length, chunks = [], table = []; let len = 0;
      const push = (u) => { chunks.push(u); len += u.length; };
      for (const [V, N, P] of out) {
        const vt = hdr + len, vb = new DataView(new ArrayBuffer(8 * V.length)); V.forEach((v, j) => v.forEach((c, q) => vb.setInt16(8 * j + 2 * q, c, true))); push(new Uint8Array(vb.buffer));
        const nt = hdr + len; let nn = 0; for (const x of N) { push(x); nn += x.length / 8; }
        const pt = hdr + len, words = P.flat(), pb = new DataView(new ArrayBuffer(4 * words.length)); words.forEach((w, j) => pb.setUint32(4 * j, w, true)); push(new Uint8Array(pb.buffer));
        table.push([p.dest + vt, V.length, p.dest + nt, nn, p.dest + pt, P.length, 0]);
      }
      const chunk = new Uint8Array(p.size), cv = new DataView(chunk.buffer);
      cv.setUint32(0, 0x41, true); cv.setUint32(4, 1, true); cv.setUint32(8, out.length, true);
      table.forEach((e, i) => e.forEach((x, q) => cv.setUint32(12 + 28 * i + 4 * q, x >>> 0, true)));
      let o = hdr; for (const c of chunks) { chunk.set(c, o); o += c.length; }
      if (o > p.clut_off) throw new Error('menu model too big');
      const [px, py, cx, cy] = p.src, vo = (x, y) => 20 + (y * 704 + x - 320) * 2;
      chunk.set(fbd.subarray(vo(cx, cy), vo(cx, cy) + 512), p.clut_off);
      for (let y = 0; y < 256; y++) chunk.set(fbd.subarray(vo(px, py + y), vo(px, py + y) + 128), p.img_off + 128 * y);
      cv.setUint32(p.magic_off, p.magic >>> 0, true);
      return chunk;
    };
    // ['icons', fbd, p] (mod crew): 16x16 4-bit heads of the riders from the menu portraits (see modular.icons_op)
    d.iconsOp = (fbd, op) => {
      const p = op[2], vo = (x, y) => 20 + (y * 704 + x - 320) * 2, rd = (o) => fbd[o] | (fbd[o + 1] << 8);
      const [dx, dy] = p.dest, [cx0, cy0] = p.clut;
      p.src.forEach(([sx, sy, w, h, cx, cy, nc], i) => {
        const clut = []; for (let j = 0; j < nc; j++) clut.push(rd(vo(cx, cy) + 2 * j));
        const small = [];
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          let r = 0, g = 0, b = 0, c = 0, t = 0;
          for (let yy = Math.floor(y * h / 16); yy < Math.floor((y + 1) * h / 16); yy++) {
            const row = vo(sx, sy + yy);
            for (let xx = Math.floor(x * w / 16); xx < Math.floor((x + 1) * w / 16); xx++) {
              t++; const ci = fbd[row + xx], v = ci < nc ? clut[ci] : 0; if (v === 0) continue;
              r += (v & 31) << 3; g += ((v >> 5) & 31) << 3; b += ((v >> 10) & 31) << 3; c++; } }
          small.push(c === 0 || c * 2 < t ? null : [Math.floor(r / c), Math.floor(g / c), Math.floor(b / c)]);
        }
        const pal = medianCut(small.filter((q) => q), 15);
        const idx = small.map((q) => { if (!q) return 0; let best = 0, bd = 1 << 30;
          pal.forEach((c, j) => { const e = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2; if (e < bd) { bd = e; best = j; } }); return best + 1; });
        for (let y = 0; y < 16; y++) { const o = vo(dx + 4 * i, dy + y); for (let x = 0; x < 16; x += 2) fbd[o + x / 2] = idx[y * 16 + x] | (idx[y * 16 + x + 1] << 4); }
        const cols = [0, ...pal.map((c) => ((c[0] >> 3) | (c[1] >> 3) << 5 | (c[2] >> 3) << 10) || 0x8000)];
        const greys = [0, ...pal.map((c) => ((Math.floor(Math.floor((c[0] * 77 + c[1] * 150 + c[2] * 29) / 256) * 5 / 8) >> 3) * 0x421) || 0x8000)];
        while (cols.length < 16) cols.push(0); while (greys.length < 16) greys.push(0);
        for (const [row, cl] of [[cy0 + Math.floor(i / 6), cols], [cy0 + 2 + Math.floor(i / 6), greys]]) {
          const o = vo(cx0 + 16 * (i % 6), row); cl.forEach((v, j) => { fbd[o + 2 * j] = v & 255; fbd[o + 2 * j + 1] = v >> 8; }); }
      });
    };
    // modular Remix (cb2-decomp remix/modular.py): pkg = {exe_crc, exe_size, ops: {feature: [op]}}, feats = ids
    // -> {lba: {sub, data}}. Ops: ['w', file, off, old, new] word, ['b', file, off, hex], ['append', file, hex],
    // ['bs', file, off, [[0, len, src] | [1, hex]]] bytes copied from the original file or new, ['rec', path, lba, size] directory record, ['sec', lba, subhex, [[0, len, addr] | [1, hex]]] whole sector
    d.applyMods = async (pkg, feats, log = () => {}) => {
      const hex = (h) => { const u = new Uint8Array(h.length >> 1); for (let i = 0; i < u.length; i++) u[i] = parseInt(h.substr(i * 2, 2), 16); return u; };
      const exe = await d.readFile('/SCES_009.92').catch(() => null);
      if (!exe || exe.length !== pkg.exe_size || d.crc32(exe) !== pkg.exe_crc) { const e = new Error('source'); e.code = 'source'; throw e; }
      const on = new Set(feats.filter((f) => pkg.ops[f]));
      if (on.has('max') || on.has('air')) on.add('input');
      if (on.has('input') && !on.has('air')) on.add('input_noair');
      if (on.size && !on.has('riders') && (pkg.ops.brand || []).length) on.add('brand');   // REMIX on the title screen (moved with 'riders')
      const order = ['unlock', 'special', 'hardmirror', 'riders', 'crew', 'outfits', 'max', 'air', 'ramming', 'bam', 'progress', 'lift', 'skipq', 'rear', 'news', 'hplive', 'input', 'input_noair', 'brand'].filter((f) => on.has(f));
      const files = {}, recs = {}, secs = {};
      const origs = {}, orig = async (p) => origs[p] || (origs[p] = await d.readFile(p));
      const buf = async (p) => { if (!files[p]) files[p] = (await orig(p)).slice(); return files[p]; };
      for (const f of order) for (const op of pkg.ops[f]) {
        if (op[0] === 'w') { const b = await buf(op[1]), dv = new DataView(b.buffer, b.byteOffset, b.length);
          if (f !== 'input_noair' && dv.getUint32(op[2], true) !== op[3] >>> 0) throw new Error('mot inattendu ' + op[1] + ' +' + op[2].toString(16));
          dv.setUint32(op[2], op[4] >>> 0, true); }
        else if (op[0] === 'b') (await buf(op[1])).set(hex(op[3]), op[2]);
        else if (op[0] === 'bs') { const b = await buf(op[1]), src = await orig(op[1]); let o = op[2];
          for (const x of op[3]) { const u = x[0] === 0 ? src.subarray(x[2], x[2] + x[1]) : hex(x[1]); b.set(u, o); o += u.length; } }
        else if (op[0] === 'append') { const a = await buf(op[1]), x = hex(op[2]), n = new Uint8Array(a.length + x.length); n.set(a); n.set(x, a.length); files[op[1]] = n; }
        else if (op[0] === 'px4') { // 4-bit image: rectangles of the original copied (transparent index skipped)
          const b = await buf(op[1]), [, , hdr, W, [cx, cy, cw, ch, fill], tr, blits] = op;
          const get = (x, y) => { const v = b[hdr + y * W * 2 + (x >> 1)]; return x & 1 ? v >> 4 : v & 15; };
          const put = (x, y, c) => { const i = hdr + y * W * 2 + (x >> 1); b[i] = x & 1 ? (b[i] & 15) | (c << 4) : (b[i] & 0xf0) | c; };
          const src = blits.map(([sx, sy, w, h]) => { const a = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.push(get(sx + x, sy + y)); return a; });
          for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) put(cx + x, cy + y, fill);
          blits.forEach(([, , w, h, dx, dy], k) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = src[k][y * w + x]; if (c !== tr) put(dx + x, dy + y, c); } });
        }
        else if (op[0] === 'rec') recs[op[1]] = [op[2], op[3]];
        else if (op[0] === 'sec') secs[op[1]] = [hex(op[2]), op[3]];
        else if (op[0] === 'icons') d.iconsOp(await buf(op[1]), op);
        else if (op[0] === 'crewmenu') { const ch = d.crewMenuChunk(await orig(op[2]), await orig(op[3]), op[4]), nch = Math.ceil(ch.length / 2048);
          const hx = (u) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');
          for (let k = 0; k < nch; k++) { const sec = new Uint8Array(2048); sec.set(ch.subarray(k * 2048, Math.min(ch.length, (k + 1) * 2048)));
            const f = k === nch - 1 ? 0x89 : 0x08; secs[op[1] + k] = [Uint8Array.from([0, 0, f, 0, 0, 0, f, 0]), [[1, hx(sec)]]]; } }
        else if (op[0] === 'face') { const m = d.files[op[2]]; log('portraits…'); await d.faceOp(await buf(op[1]), (k) => d.user(m.lba + k), Math.floor(m.size / 2048), op); }
      }
      log('…');
      const mods = {}, blank = (n) => new Uint8Array(n);
      const ms = files['/MAIN_SEL.BIN'];
      if (ms && ms.length > d.files['/MAIN_SEL.BIN'].size) { // grown MAIN_SEL moves to the end of the info movie (cut)
        const nms = Math.ceil(ms.length / 2048), sm = d.files['/MOVIE/SBCMOVE.STR'], sn = Math.floor(sm.size / 2048), ml = sm.lba + sn - nms;
        recs['/MOVIE/SBCMOVE.STR'] = [sm.lba, (sn - nms) * 2048]; recs['/MAIN_SEL.BIN'] = [ml, ms.length];
        for (let k = 0; k < nms; k++) { const data = blank(2048); data.set(ms.subarray(k * 2048, Math.min(ms.length, (k + 1) * 2048)));
          mods[ml + k] = { sub: Uint8Array.from([0, 0, k === nms - 1 ? 0x89 : 0x08, 0, 0, 0, k === nms - 1 ? 0x89 : 0x08, 0]), data }; }
        delete files['/MAIN_SEL.BIN'];
      }
      const md = files['/MODE_SEL.BIN'];
      if (md && Math.ceil(md.length / 2048) > Math.ceil(d.files['/MODE_SEL.BIN'].size / 2048)) { // in-game progress page: moves to the end of the credits movie (cut)
        const n2 = Math.ceil(md.length / 2048), sm = d.files['/MOVIE/STAFFE.STR'], sn = Math.floor(sm.size / 2048), ml = sm.lba + sn - n2;
        recs['/MOVIE/STAFFE.STR'] = [sm.lba, (sn - n2) * 2048]; recs['/MODE_SEL.BIN'] = [ml, md.length];
        for (let k = 0; k < n2; k++) { const data = blank(2048); data.set(md.subarray(k * 2048, Math.min(md.length, (k + 1) * 2048)));
          mods[ml + k] = { sub: Uint8Array.from([0, 0, k === n2 - 1 ? 0x89 : 0x08, 0, 0, 0, k === n2 - 1 ? 0x89 : 0x08, 0]), data }; }
        delete files['/MODE_SEL.BIN'];
      }
      for (const [p, b] of Object.entries(files)) {
        const e = d.files[p];
        if (b.length !== e.size) { if (Math.ceil(b.length / 2048) !== Math.ceil(e.size / 2048)) throw new Error('taille ' + p); if (!recs[p]) recs[p] = [e.lba, b.length]; }
        for (let k = 0; k < Math.ceil(b.length / 2048); k++) {
          const orig = await d.user(e.lba + k), nw = orig.slice(); nw.set(b.subarray(k * 2048, Math.min(b.length, (k + 1) * 2048)));
          if (nw.some((x, i) => x !== orig[i])) mods[e.lba + k] = nw;
        }
      }
      const src = async (addr, len) => { const out = new Uint8Array(len); let k = 0; while (k < len) { const l = Math.floor((addr + k) / 2048), off = (addr + k) % 2048, m = Math.min(len - k, 2048 - off); out.set((await d.user(l)).subarray(off, off + m), k); k += m; } return out; };
      for (const [l, [sub, ops]] of Object.entries(secs)) {
        const data = new Uint8Array(2048); let p = 0;
        for (const op of ops) { const x = op[0] === 0 ? await src(op[2], op[1]) : hex(op[1]); data.set(x, p); p += x.length; }
        mods[l] = { sub, data };
      }
      for (const [p, [l, s]] of Object.entries(recs)) {
        const r = d.files[p].rec, m = mods[r.lba], data = (m ? (m instanceof Uint8Array ? m : m.data) : await d.user(r.lba)).slice(), dv = new DataView(data.buffer);
        dv.setUint32(r.off + 2, l, true); dv.setUint32(r.off + 6, l, false); dv.setUint32(r.off + 10, s, true); dv.setUint32(r.off + 14, s, false);
        mods[r.lba] = m && !(m instanceof Uint8Array) ? { sub: m.sub, data } : data;
      }
      return mods;
    };
    // configuration code written in the volume descriptor (application-use area, unused by the game)
    d.markConfig = async (mods, text) => {
      const m = mods[16], data = (m ? (m instanceof Uint8Array ? m : m.data) : await d.user(16)).slice();
      const s = 'CB2REMIX ' + text; data.fill(0, 900, 1000); for (let i = 0; i < s.length && i < 100; i++) data[900 + i] = s.charCodeAt(i);
      mods[16] = data; return mods;
    };
    d.readConfig = async () => { const u = await d.user(16), s = String.fromCharCode(...u.subarray(900, 1000)).replace(/\0.*$/s, ''); return s.startsWith('CB2REMIX ') ? s.slice(9) : null; };
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
