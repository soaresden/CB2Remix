// CHD v5 hunk patcher: replaces whole hunks of a compressed CD CHD by uncompressed ones,
// relinks the data and rewrites the (huffman-coded) hunk map. Works in browser and node.
// read(start,end) -> Promise<Uint8Array> ; returns {parts:[{a,b}|Uint8Array], size}
(function (root) {
  const CRC = new Uint16Array(256);
  for (let i = 0; i < 256; i++) { let c = i << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; CRC[i] = c; }
  function crc16(d, c = 0xffff) { for (let i = 0; i < d.length; i++) c = ((c << 8) & 0xffff) ^ CRC[(c >> 8) ^ d[i]]; return c; }
  const be = (d, o, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + d[o + i]; return v; };
  const putbe = (d, o, n, v) => { for (let i = n - 1; i >= 0; i--) { d[o + i] = v % 256; v = Math.floor(v / 256); } };
  const hex = (d) => Array.from(d, (x) => x.toString(16).padStart(2, '0')).join('');
  class BR { constructor(b) { this.b = b; this.p = 0; }
    read(n) { let v = 0; for (let i = 0; i < n; i++) { const by = this.b[this.p >> 3] || 0; v = v * 2 + ((by >> (7 - (this.p & 7))) & 1); this.p++; } return v; } }
  class BW { constructor() { this.out = []; this.cur = 0; this.n = 0; }
    write(v, n) { for (let i = n - 1; i >= 0; i--) { this.cur = (this.cur << 1) | (Math.floor(v / 2 ** i) & 1); if (++this.n === 8) { this.out.push(this.cur); this.cur = 0; this.n = 0; } } }
    bytes() { const o = this.out.slice(); if (this.n) o.push(this.cur << (8 - this.n)); return new Uint8Array(o); } }
  function canon(lens) { // libchdr huffman_assign_canonical_codes
    const histo = new Array(33).fill(0); lens.forEach((l) => histo[l]++);
    let cur = 0;
    for (let L = 32; L > 0; L--) { const nx = (cur + histo[L]) >> 1; if (L !== 1 && nx * 2 !== cur + histo[L]) throw new Error('arbre huffman invalide'); histo[L] = cur; cur = nx; }
    return lens.map((l) => (l > 0 ? histo[l]++ : -1));
  }
  function decodeMap(hdr, map) {
    const hunkcount = Math.ceil(hdr.logical / hdr.hunkbytes);
    const mapbytes = be(map, 0, 4), firstoffs = be(map, 4, 6), mapcrc = be(map, 10, 2);
    const lengthbits = map[12], selfbits = map[13], parentbits = map[14];
    const br = new BR(map.subarray(16, 16 + mapbytes));
    const lens = [];
    while (lens.length < 16) { let nb = br.read(4); if (nb !== 1) lens.push(nb); else { nb = br.read(4); if (nb === 1) lens.push(1); else { let r = br.read(4) + 3; while (r--) lens.push(nb); } } }
    const codes = canon(lens), table = new Map();
    lens.forEach((l, s) => { if (l > 0) table.set(l * 65536 + codes[s], s); });
    const sym = () => { let c = 0; for (let l = 1; l <= 8; l++) { c = c * 2 + br.read(1); const s = table.get(l * 65536 + c); if (s !== undefined) return s; } throw new Error('code huffman invalide'); };
    const type = new Uint8Array(hunkcount);
    let rep = 0, last = 0;
    for (let h = 0; h < hunkcount; h++) {
      if (rep > 0) { type[h] = last; rep--; continue; }
      const v = sym();
      if (v === 7) { type[h] = last; rep = 2 + sym(); }
      else if (v === 8) { type[h] = last; rep = 2 + 16 + (sym() << 4); rep += sym(); }
      else type[h] = last = v;
    }
    const len = new Array(hunkcount), off = new Array(hunkcount), crc = new Uint16Array(hunkcount);
    let cur = firstoffs, lastSelf = 0;
    for (let h = 0; h < hunkcount; h++) {
      let o = cur, l = 0, c = 0, t = type[h];
      if (t <= 3) { l = br.read(lengthbits); cur += l; c = br.read(16); }
      else if (t === 4) { l = hdr.hunkbytes; cur += l; c = br.read(16); }
      else if (t === 5) { lastSelf = o = br.read(selfbits); }
      else if (t === 9 || t === 10) { if (t === 10) lastSelf++; t = 5; o = lastSelf; }
      else throw new Error('type de hunk non géré : ' + t);
      type[h] = t; len[h] = l; off[h] = o; crc[h] = c;
    }
    const raw = rawmap(type, len, off, crc);
    if (crc16(raw) !== mapcrc) throw new Error('CRC de la carte incorrect');
    return { hunkcount, firstoffs, lengthbits, selfbits, parentbits, type, len, off, crc };
  }
  function rawmap(type, len, off, crc) {
    const r = new Uint8Array(type.length * 12);
    for (let h = 0; h < type.length; h++) { const p = h * 12; r[p] = type[h]; putbe(r, p + 1, 3, len[h]); putbe(r, p + 4, 6, off[h]); putbe(r, p + 10, 2, crc[h]); }
    return r;
  }
  function parsePatch(p) {
    if (String.fromCharCode(...p.subarray(0, 4)) !== 'CB2P') throw new Error('fichier patch invalide');
    const srcSha = p.subarray(8, 28), dstRaw = p.subarray(28, 48), dstSha = p.subarray(48, 68);
    const hb = be(p, 68, 4), n = be(p, 72, 4), hunks = new Map();
    let o = 76;
    for (let i = 0; i < n; i++) { hunks.set(be(p, o, 4), { crc: be(p, o + 4, 2), data: p.subarray(o + 6, o + 6 + hb) }); o += 6 + hb; }
    return { srcSha, dstRaw, dstSha, hb, hunks };
  }
  async function patchHunks(read, size, hunks, log = () => {}) {
    const h = await read(0, 124);
    const hdr0 = { hunkbytes: be(h, 56, 4) };
    return patchChd(read, size, null, log, { srcSha: h.subarray(84, 104), dstRaw: new Uint8Array(20), dstSha: new Uint8Array(20), hb: hdr0.hunkbytes, hunks });
  }
  async function patchChd(read, size, patchBytes, log = () => {}, PP = null) {
    const P = PP || parsePatch(patchBytes);
    const h = await read(0, 124);
    if (String.fromCharCode(...h.subarray(0, 8)) !== 'MComprHD' || be(h, 12, 4) !== 5) throw new Error("ce n'est pas un CHD v5");
    const hdr = { logical: be(h, 32, 8), mapoffset: be(h, 40, 8), hunkbytes: be(h, 56, 4) };
    const sha = h.subarray(84, 104);
    if (hex(sha) !== hex(P.srcSha)) {
      if (hex(sha) === hex(P.dstSha)) throw new Error('ce CHD est déjà patché');
      throw new Error("ce CHD n'est pas la version attendue (SHA1 " + hex(sha) + ')');
    }
    if (hdr.hunkbytes !== P.hb) throw new Error('taille de hunk inattendue');
    log('Lecture de la carte des hunks…');
    const mh = await read(hdr.mapoffset, hdr.mapoffset + 16);
    const map = await read(hdr.mapoffset, hdr.mapoffset + 16 + be(mh, 0, 4));
    const M = decodeMap(hdr, map);
    log(M.hunkcount + ' hunks, ' + P.hunks.size + ' à remplacer');
    const N = M.hunkcount, type = new Uint8Array(N), len = new Array(N), off = new Array(N), crc = new Uint16Array(N);
    const parts = [], src = new Array(N);
    let cur = M.firstoffs;
    const root = (t) => { let k = 0; while (M.type[t] === 5 && k++ < 64) t = M.off[t]; return t; };
    for (let i = 0; i < N; i++) {
      let t = M.type[i], r = i;
      if (P.hunks.has(i)) { const e = P.hunks.get(i); type[i] = 4; len[i] = hdr.hunkbytes; off[i] = cur; crc[i] = e.crc; parts.push(e.data); cur += hdr.hunkbytes; continue; }
      if (t === 5) { r = root(M.off[i]); if (!P.hunks.has(r) && !P.hunks.has(M.off[i])) { type[i] = 5; len[i] = 0; off[i] = M.off[i]; crc[i] = 0; continue; } t = M.type[r]; }
      type[i] = t; len[i] = M.len[r]; crc[i] = M.crc[r]; off[i] = cur;
      const a = M.off[r], b = a + M.len[r], last = parts[parts.length - 1];
      if (last && !(last instanceof Uint8Array) && last.b === a) last.b = b; else parts.push({ a, b });
      cur += M.len[r];
    }
    // encode the new map
    let lengthbits = M.lengthbits, selfbits = M.selfbits;
    for (let i = 0; i < N; i++) { if (type[i] <= 3) while (len[i] >= 2 ** lengthbits) lengthbits++; if (type[i] === 5) while (off[i] >= 2 ** selfbits) selfbits++; }
    const bw = new BW();
    bw.write(1, 4); bw.write(4, 4); bw.write(13, 4); // 16 codes of 4 bits -> code == symbol
    for (let i = 0; i < N; i++) bw.write(type[i], 4);
    for (let i = 0; i < N; i++) {
      if (type[i] <= 3) { bw.write(len[i], lengthbits); bw.write(crc[i], 16); }
      else if (type[i] === 4) bw.write(crc[i], 16);
      else bw.write(off[i], selfbits);
    }
    const bits = bw.bytes();
    const mapcrc = crc16(rawmap(type, len.map((v, i) => (type[i] === 4 ? hdr.hunkbytes : v)), off, crc));
    const mhdr = new Uint8Array(16);
    putbe(mhdr, 0, 4, bits.length); putbe(mhdr, 4, 6, M.firstoffs); putbe(mhdr, 10, 2, mapcrc);
    mhdr[12] = lengthbits; mhdr[13] = selfbits; mhdr[14] = M.parentbits;
    const prefix = (await read(0, M.firstoffs)).slice();
    putbe(prefix, 40, 8, cur);
    if (P.dstSha.some((x) => x)) { prefix.set(P.dstRaw, 64); prefix.set(P.dstSha, 84); }
    parts.unshift(prefix); parts.push(mhdr, bits);
    const total = cur + 16 + bits.length;
    log('Nouveau CHD : ' + (total / 1048576).toFixed(1) + ' Mo');
    return { parts, size: total };
  }
  // new CHD made of hunks of two CHDs with the same geometry and codecs: entries[i] = {data} (uncompressed hunk),
  // or {src: 0|1, M, i} (hunk i of source 0 / 1, copied as stored). meta = [{tag, flags, data}]. head = header of source 0.
  // -> {parts: [Uint8Array | {a, b, f}], size}  (f = source index of a byte range)
  function composeChd(head, hunkbytes, entries, meta, parentbits) {
    const N = entries.length, type = new Uint8Array(N), len = new Array(N).fill(0), off = new Array(N).fill(0), crc = new Uint16Array(N), parts = [];
    let cur = 124;
    const root = (M, t) => { let k = 0; while (M.type[t] === 5 && k++ < 64) t = M.off[t]; return t; };
    for (let i = 0; i < N; i++) {
      const e = entries[i];
      if (e.data) { type[i] = 4; len[i] = hunkbytes; off[i] = cur; crc[i] = crc16(e.data); parts.push(e.data); cur += hunkbytes; continue; }
      const M = e.M; let t = M.type[e.i], r = e.i;
      if (t === 5) {
        r = root(M, M.off[e.i]); const ref = M.off[e.i];
        if (ref < i && entries[ref] && entries[ref].src === e.src && entries[ref].i === ref && !entries[ref].data) { type[i] = 5; off[i] = ref; continue; }
        t = M.type[r];
      }
      type[i] = t; len[i] = M.len[r]; crc[i] = M.crc[r]; off[i] = cur;
      const a = M.off[r], b = a + M.len[r], last = parts[parts.length - 1];
      if (last && !(last instanceof Uint8Array) && last.f === e.src && last.b === a) last.b = b; else parts.push({ a, b, f: e.src });
      cur += M.len[r];
    }
    const metaoff = cur, mparts = [];
    meta.forEach((m, k) => { const h = new Uint8Array(16); h.set(m.tag, 0); h[4] = m.flags; putbe(h, 5, 3, m.data.length);
      const nxt = k === meta.length - 1 ? 0 : cur + 16 + m.data.length; putbe(h, 8, 8, nxt); mparts.push(h, m.data); cur += 16 + m.data.length; });
    let lb = 0, sb = 0;
    for (let i = 0; i < N; i++) { if (type[i] <= 3) while (len[i] >= 2 ** lb) lb++; if (type[i] === 5) while (off[i] >= 2 ** sb) sb++; }
    const bw = new BW(); bw.write(1, 4); bw.write(4, 4); bw.write(13, 4);
    for (let i = 0; i < N; i++) bw.write(type[i], 4);
    for (let i = 0; i < N; i++) { if (type[i] <= 3) { bw.write(len[i], lb); bw.write(crc[i], 16); } else if (type[i] === 4) bw.write(crc[i], 16); else bw.write(off[i], sb); }
    const bits = bw.bytes(), mapcrc = crc16(rawmap(type, len.map((v, i) => (type[i] === 4 ? hunkbytes : v)), off, crc));
    const mhdr = new Uint8Array(16); putbe(mhdr, 0, 4, bits.length); putbe(mhdr, 4, 6, 124); putbe(mhdr, 10, 2, mapcrc); mhdr[12] = lb; mhdr[13] = sb; mhdr[14] = parentbits;
    const h = head.slice(0, 124); putbe(h, 32, 8, N * hunkbytes); putbe(h, 40, 8, cur); putbe(h, 48, 8, metaoff);
    return { parts: [h, ...parts, ...mparts, mhdr, bits], size: cur + 16 + bits.length };
  }
  const api = { patchChd, patchHunks, composeChd, crc16, decodeMap };
  if (typeof module !== 'undefined') module.exports = api; else root.CHDPatch = api;
})(this);
