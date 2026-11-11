// Cool Boarders 2 custom board ("Original board", memory card file BESCES-00992BOARD1) + raw 128 KB memory cards
(function (root) {
  const W = 128, H = 64, NAME = 'BESCES-00992BOARD1', SIZE = 0x4000;
  const STYLES = ['Free Style', 'All-Around', 'Alpine'];
  function checksum(b, a, n) { let t = 0x6b383658; for (let i = 0; i < n; i++) { const x = b[a + i]; t = (t ^ ((x << (i & 31)) | (x << ((32 - i) & 31)))) >>> 0; } return t >>> 0; }
  // ---- memory card (raw 128 KB: .srm / .mcd)
  function newCard() {
    const c = new Uint8Array(131072); c[0] = 0x4d; c[1] = 0x43; c[127] = 0x0e;
    for (let i = 1; i < 16; i++) { const o = i * 128; c[o] = 0xa0; c[o + 8] = 0xff; c[o + 9] = 0xff; fix(c, i); }
    for (let i = 16; i < 36; i++) { const o = i * 128; c[o] = 0xff; c[o + 1] = 0xff; c[o + 2] = 0xff; c[o + 3] = 0xff; c[o + 8] = 0xff; c[o + 9] = 0xff; fix(c, i); }
    c.set(c.subarray(0, 128), 63 * 128); return c;
  }
  function fix(c, i) { const o = i * 128; let x = 0; for (let k = 0; k < 127; k++) x ^= c[o + k]; c[o + 127] = x; }
  function cardOK(c) { return c.length === 131072 && c[0] === 0x4d && c[1] === 0x43; }
  const ename = (c, i) => { let s = ''; for (let k = 10; k < 30 && c[i * 128 + k]; k++) s += String.fromCharCode(c[i * 128 + k]); return s; };
  function findFile(c, name) { for (let i = 1; i < 16; i++) if ((c[i * 128] & 0xf0) === 0x50 && c[i * 128] === 0x51 && ename(c, i) === name) return i; return -1; }
  function chain(c, first) { const out = []; let i = first, k = 0; while (i > 0 && i < 16 && k++ < 16) { out.push(i); const nx = c[i * 128 + 8] | (c[i * 128 + 9] << 8); if (nx === 0xffff) break; i = nx + 1; } return out; }
  function readFile(c, name) { const f = findFile(c, name); if (f < 0) return null; const bl = chain(c, f); const out = new Uint8Array(bl.length * 8192); bl.forEach((b, k) => out.set(c.subarray(b * 8192, (b + 1) * 8192), k * 8192)); return out; }
  function writeFile(c, name, data) { // data: multiple of 8192
    c = c.slice(); const nb = data.length / 8192;
    const old = findFile(c, name);
    if (old > 0) for (const b of chain(c, old)) { const o = b * 128; c.fill(0, o, o + 128); c[o] = 0xa0; c[o + 8] = 0xff; c[o + 9] = 0xff; fix(c, b); }
    const free = []; for (let i = 1; i < 16 && free.length < nb; i++) if (c[i * 128] === 0xa0 || c[i * 128] === 0xa1 || c[i * 128] === 0xa2 || c[i * 128] === 0xa3) free.push(i);
    if (free.length < nb) throw new Error('pas assez de place sur la carte mémoire (' + nb + ' blocs nécessaires)');
    free.forEach((b, k) => {
      const o = b * 128; c.fill(0, o, o + 128);
      c[o] = k === 0 ? 0x51 : k === nb - 1 ? 0x53 : 0x52;
      if (k === 0) { c[o + 4] = data.length & 0xff; c[o + 5] = (data.length >> 8) & 0xff; c[o + 6] = data.length >> 16; for (let j = 0; j < name.length; j++) c[o + 10 + j] = name.charCodeAt(j); }
      const nx = k === nb - 1 ? 0xffff : free[k + 1] - 1; c[o + 8] = nx & 0xff; c[o + 9] = nx >> 8; fix(c, b);
      c.set(data.subarray(k * 8192, (k + 1) * 8192), b * 8192);
    });
    return c;
  }
  // ---- board data
  // file: 0x200 save header (from the game exe) + "ORGBOARD", style word, checksum, 256-colour CLUT, 128x64 8bpp image
  function decode(file) {
    const d = file.subarray(0x200);
    if (String.fromCharCode(...d.subarray(0, 8)) !== 'ORGBOARD') throw new Error('planche illisible');
    const kind = d[8] | (d[9] << 8); const pal = new Uint16Array(256); for (let i = 0; i < 256; i++) pal[i] = d[0x10 + 2 * i] | (d[0x11 + 2 * i] << 8);
    const pix = d.slice(0x210, 0x210 + W * H);
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) { const c = pal[pix[i]]; rgba[i * 4] = ((c & 31) << 3) | ((c & 31) >> 2); rgba[i * 4 + 1] = (((c >> 5) & 31) << 3) | (((c >> 5) & 31) >> 2); rgba[i * 4 + 2] = (((c >> 10) & 31) << 3) | (((c >> 10) & 31) >> 2); rgba[i * 4 + 3] = 255; }
    return { style: kind >> 2, type: kind & 3, rgba };
  }
  function encode(rgba, style, type, header) { // header: 0x200 bytes
    const px = []; for (let i = 0; i < W * H; i++) px.push([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
    const cols = quant(px, 32);
    const f = new Uint8Array(SIZE); f.set(header, 0); const d = f.subarray(0x200);
    'ORGBOARD'.split('').forEach((ch, k) => (d[k] = ch.charCodeAt(0)));
    d[8] = style * 4 + type;
    cols.forEach((c, k) => { const v = 0x8000 | (c[0] >> 3) | ((c[1] >> 3) << 5) | ((c[2] >> 3) << 10); d[0x10 + 2 * k] = v & 0xff; d[0x11 + 2 * k] = v >> 8; });
    for (let k = cols.length; k < 256; k++) { d[0x10 + 2 * k] = 0; d[0x11 + 2 * k] = 0x80; }
    for (let i = 0; i < W * H; i++) { let b = 0, bd = 1e9; const p = px[i]; cols.forEach((c, k) => { const e = (c[0] - p[0]) ** 2 * 3 + (c[1] - p[1]) ** 2 * 4 + (c[2] - p[2]) ** 2 * 2; if (e < bd) { bd = e; b = k; } }); d[0x210 + i] = b; }
    const ck = checksum(d, 0x10, 0x2200); d[12] = ck & 0xff; d[13] = (ck >> 8) & 0xff; d[14] = (ck >> 16) & 0xff; d[15] = ck >>> 24;
    return f;
  }
  function header(exe) { // 'SC', 1-frame icon, 2 blocks, title + icon palette + icon bitmap taken from the game exe
    const h = new Uint8Array(0x200); h[0] = 0x53; h[1] = 0x43; h[2] = 0x11; h[3] = 0x02;
    h.set(exe.subarray(0x1248, 0x1248 + 64), 4); h.set(exe.subarray(0x128c, 0x128c + 32), 0x60); h.set(exe.subarray(0x12ac, 0x12ac + 128), 0x80);
    if (h[4] !== 0x82) throw new Error("en-tête de sauvegarde introuvable dans l'exécutable");
    return h;
  }
  function quant(px, n) { // median cut + k-means (shared with the skins)
    let boxes = [px];
    while (boxes.length < n) {
      let bi = -1, br = 0, bc = 0;
      boxes.forEach((b, i) => { if (b.length < 2) return; for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; } const s = (hi - lo) * Math.sqrt(b.length); if (s > br) { br = s; bi = i; bc = c; } } });
      if (bi < 0 || br === 0) break;
      const b = boxes[bi].slice().sort((p, q) => p[bc] - q[bc]); const m = b.length >> 1; boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
    }
    let cols = boxes.map((b) => [0, 1, 2].map((c) => Math.round(b.reduce((s, p) => s + p[c], 0) / b.length)));
    for (let it = 0; it < 4; it++) {
      const acc = cols.map(() => [0, 0, 0, 0]);
      for (const p of px) { let bk = 0, bd = 1e9; cols.forEach((c, k) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (d < bd) { bd = d; bk = k; } }); const a = acc[bk]; a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; a[3]++; }
      cols = cols.map((c, k) => (acc[k][3] ? acc[k].slice(0, 3).map((v) => Math.round(v / acc[k][3])) : c));
    }
    return cols;
  }
  const api = { W, H, NAME, STYLES, newCard, cardOK, readFile, writeFile, decode, encode, header, checksum, quant };
  if (typeof module !== 'undefined') module.exports = api; else root.Board = api;
})(this);
