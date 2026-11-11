// Cool Boarders 2 data: rider models (PMD), outfit textures (FBD), skin application.
(function (root) {
  const FR = '/DATA/CHR/FR/';
  // 7 riders, model + outfit textures. Free-ride FBD textures are used in every mode (competition too).
  // menu choice k = 3*jacket + pants -> file (the game's own table, file indices 0xb4..0xd7)
  const ORDER = { FRM1: ['11', '10', '12', '01', '00', '02', '21', '20', '22'], FRM2: ['00', '01', '02', '10', '11', '12', '20', '21', '22'],
    FRFM1: ['00', '01', '02', '10', '11', '12', '20', '21', '22'], FRFM2: ['20', '21', '22', '10', '11', '12', '00', '01', '02'] };
  const combos = (pre, dir) => ORDER[pre].map((n, k) => ({ id: `${pre}_${n}`, lab: ['combo', ((k / 3) | 0) + 1, (k % 3) + 1], file: `${FR}${dir}/${pre}_${n}.FBD` }));
  const RIDERS = [
    { id: 'yaggi', name: 'Yaggi', model: FR + '1P/FRM1.PMD', slots: combos('FRM1', 'FBD') },
    { id: 'jin', name: 'Jin', model: FR + '1P/FRM2.PMD', slots: combos('FRM2', 'FBD') },
    { id: 'cindy', name: 'Cindy', model: FR + '1P/FRFM1.PMD', slots: combos('FRFM1', 'FBD2').concat([0, 1, 2].map((k) => ({ id: `FRFM1_S${k}`, lab: ['hidden', k + 1, k + 4], file: `${FR}FBD3/FRFM1_S${k}.FBD` }))) },
    { id: 'irin', name: 'Irin', model: FR + '1P/FRFM2.PMD', slots: combos('FRFM2', 'FBD2').concat([0, 1, 2].map((k) => ({ id: `FRFM2_S${k}`, lab: ['hidden', k + 1, k + 4], file: `${FR}FBD3/FRFM2_S${k}.FBD` }))) },
    { id: 'boss', name: 'Boss', model: FR + '1P/BOSS.PMD', slots: [0, 1].map((k) => ({ id: `BOSS${k}`, lab: ['color', k + 1], file: `${FR}FBD3/BOSS${k}.FBD` })) },
    { id: 'gray', name: 'Gray', model: FR + '1P/GRAY.PMD', slots: [0, 1].map((k) => ({ id: `GRAY${k}`, lab: ['color', k + 1], file: `${FR}FBD3/GRAY${k}.FBD`, enemy: k === 0 ? 'eg' : null })) },
    { id: 'snow', name: 'Snowman', model: FR + '1P/SNOW.PMD', slots: [0, 1].map((k) => ({ id: `SNOW${k}`, lab: ['color', k + 1], file: `${FR}FBD3/SNOW${k}.FBD`, enemy: k === 0 ? 'es' : null })) },
  ];
  const TW = 128, TH = 256;
  const le32 = (d, o) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
  const s16 = (d, o) => { const v = d[o] | (d[o + 1] << 8); return v & 0x8000 ? v - 0x10000 : v; };
  // ---- PMD (non-shared vertices). Returns [{nv, v:[[x,y,z]..], uv:[[u,v]..], clut, tp, col}]
  function readPMD(d) {
    if (le32(d, 0) !== 0x42) throw new Error('PMD inattendu');
    const nobj = le32(d, 12); let o = 16; const blocks = [];
    for (let k = 0; k < nobj; k++) { const n = le32(d, o); for (let i = 0; i < n; i++) blocks.push([le32(d, o + 4 + 4 * i), k]); o += 4 + 4 * n; }
    const prims = [];
    for (const [p, obj] of blocks) {
      const h = le32(d, p), cnt = h & 0xffff; let q = p + 4;
      for (let i = 0; i < cnt; i++) {
        const cmd = d[q + 7]; const quad = !!(cmd & 8), gour = !!(cmd & 0x10), tex = !!(cmd & 4); const nv = quad ? 4 : 3;
        const nw = nv * (1 + (tex ? 1 : 0) + (gour ? 1 : 0)) + (gour ? 0 : 1);
        let idx = 0; const uv = []; let clut = 0, tp = 0, col = null;
        for (let v = 0; v < nv; v++) {
          if (gour || v === 0) { const w = le32(d, q + 4 + 4 * idx); if (v === 0) col = w & 0xffffff; idx++; }
          idx++;
          if (tex) { const w = le32(d, q + 4 + 4 * idx); idx++; uv.push([w & 0xff, (w >>> 8) & 0xff]); if (v === 0) clut = w >>> 16; if (v === 1) tp = w >>> 16; }
        }
        q += 4 * (1 + nw) * 2;
        const vs = []; for (let v = 0; v < nv; v++) { vs.push([s16(d, q), s16(d, q + 2), s16(d, q + 4)]); q += 8; }
        prims.push({ nv, v: vs, uv, clut, tp, col, tex, obj });
      }
    }
    return prims;
  }
  // ---- FBD: 20-byte header, 2x256 CLUT, 128x256 4bpp image
  function readFBD(d) {
    const clut = new Uint16Array(512); for (let i = 0; i < 512; i++) clut[i] = d[20 + 2 * i] | (d[21 + 2 * i] << 8);
    const pix = new Uint8Array(TW * TH); const o = 20 + 1024;
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x += 2) { const b = d[o + y * 64 + (x >> 1)]; pix[y * TW + x] = b & 15; pix[y * TW + x + 1] = b >> 4; }
    return { clut, pix, raw: d };
  }
  function writeFBD(f) {
    const d = f.raw.slice();
    for (let i = 0; i < 512; i++) { d[20 + 2 * i] = f.clut[i] & 0xff; d[21 + 2 * i] = f.clut[i] >> 8; }
    const o = 20 + 1024;
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x += 2) d[o + y * 64 + (x >> 1)] = f.pix[y * TW + x] | (f.pix[y * TW + x + 1] << 4);
    return d;
  }
  // texel -> sub-palette (0..31) used by the model, -1 = unused
  function palMap(prims) {
    const pm = new Int8Array(TW * TH).fill(-1);
    for (const t of prims) {
      if (!t.tex || (t.tp & 0xf) !== 9) continue;
      const cx = (t.clut & 0x3f) * 16 - 768, cy = (t.clut >> 6) - 493;
      if (cy < 0 || cy > 1 || cx < 0 || cx > 255) continue;
      const pal = cy * 16 + (cx >> 4);
      const tris = [[t.uv[0], t.uv[1], t.uv[2]]]; if (t.nv === 4) tris.push([t.uv[1], t.uv[3], t.uv[2]]);
      for (const tr of tris) rasterUV(tr, (x, y) => { if (x >= 0 && x < TW && y >= 0 && y < TH && pm[y * TW + x] < 0) pm[y * TW + x] = pal; });
    }
    return pm;
  }
  function rasterUV(tr, put) { // texel centres inside the triangle, or within 0.6 texel of an edge
    const xs = tr.map((p) => p[0]), ys = tr.map((p) => p[1]);
    const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
    const E = [[tr[0], tr[1]], [tr[1], tr[2]], [tr[2], tr[0]]];
    const area = (tr[1][0] - tr[0][0]) * (tr[2][1] - tr[0][1]) - (tr[1][1] - tr[0][1]) * (tr[2][0] - tr[0][0]);
    const sg = area >= 0 ? 1 : -1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5; let ok = true;
      for (const [a, b] of E) {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const d = sg * ((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0])) / L;
        if (d < -0.6) { ok = false; break; }
      }
      if (ok) put(x, y);
    }
  }
  const c2rgb = (c) => [(c & 31) << 3 | (c & 31) >> 2, ((c >> 5) & 31) << 3 | ((c >> 5) & 31) >> 2, ((c >> 10) & 31) << 3 | ((c >> 10) & 31) >> 2];
  // RGBA image of the texture as the model shows it
  function toRGBA(f, pm) {
    const out = new Uint8ClampedArray(TW * TH * 4);
    for (let i = 0; i < TW * TH; i++) {
      const p = pm[i] < 0 ? 0 : pm[i], c = f.clut[p * 16 + f.pix[i]], [r, g, b] = c2rgb(c);
      out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = pm[i] < 0 ? 0 : (c === 0 ? 0 : 255);
    }
    return out;
  }
  // ---- apply an RGBA image (the edited texture) back into the FBD: each sub-palette is re-quantized to 16 colours
  function fromRGBA(f0, pm, rgba, changed) {
    const f = { clut: f0.clut.slice(), pix: f0.pix.slice(), raw: f0.raw };
    const groups = new Map();
    for (let i = 0; i < TW * TH; i++) { if (pm[i] < 0) continue; if (!groups.has(pm[i])) groups.set(pm[i], []); groups.get(pm[i]).push(i); }
    for (const [pal, tex] of groups) {
      if (!tex.some((i) => changed[i])) continue;
      const transIdx = []; for (let k = 0; k < 16; k++) if (f0.clut[pal * 16 + k] === 0) transIdx.push(k);
      const opaque = tex.filter((i) => rgba[i * 4 + 3] >= 128), trans = tex.filter((i) => rgba[i * 4 + 3] < 128);
      const nCol = 16 - (trans.length ? 1 : 0);
      const cols = medianCut(opaque.map((i) => [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]), nCol);
      const pal16 = new Uint16Array(16); let k0 = 0;
      if (trans.length) { pal16[0] = 0; k0 = 1; }
      cols.forEach((c, k) => { let v = (c[0] >> 3) | ((c[1] >> 3) << 5) | ((c[2] >> 3) << 10); if (v === 0) v = 0x0421; pal16[k0 + k] = v; });
      for (let k = 0; k < 16; k++) f.clut[pal * 16 + k] = pal16[k];
      for (const i of trans) f.pix[i] = 0;
      for (const i of opaque) { let best = k0, bd = 1e9; for (let k = 0; k < cols.length; k++) { const c = cols[k]; const dd = (c[0] - rgba[i * 4]) ** 2 * 3 + (c[1] - rgba[i * 4 + 1]) ** 2 * 4 + (c[2] - rgba[i * 4 + 2]) ** 2 * 2; if (dd < bd) { bd = dd; best = k0 + k; } } f.pix[i] = best; }
    }
    return f;
  }
  function medianCut(px, n) {
    if (!px.length) return [[128, 128, 128]];
    let boxes = [px];
    while (boxes.length < n) {
      let bi = -1, br = 0, bc = 0;
      boxes.forEach((b, i) => { if (b.length < 2) return; for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; } if ((hi - lo) * Math.sqrt(b.length) > br) { br = (hi - lo) * Math.sqrt(b.length); bi = i; bc = c; } } });
      if (bi < 0 || br === 0) break;
      const b = boxes[bi].slice().sort((p, q) => p[bc] - q[bc]); const m = b.length >> 1;
      boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
    }
    let cols = boxes.map((b) => [0, 1, 2].map((c) => Math.round(b.reduce((s, p) => s + p[c], 0) / b.length)));
    // 3 k-means passes
    for (let it = 0; it < 3; it++) {
      const acc = cols.map(() => [0, 0, 0, 0]);
      for (const p of px) { let bk = 0, bd = 1e9; cols.forEach((c, k) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (d < bd) { bd = d; bk = k; } }); const a = acc[bk]; a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; a[3]++; }
      cols = cols.map((c, k) => (acc[k][3] ? acc[k].slice(0, 3).map((v) => Math.round(v / acc[k][3])) : c));
    }
    return cols;
  }
  // ---- ENEMY variants used by Gray / Snowman in competition (CPU-style texture sheet built by the Remix):
  // columns 0..31 (halfwords) of the image and CLUT rows 14,15 hold that rider's FBD
  function patchEnemy(e, fbdBytes) {
    e = e.slice(); const clutE = 20, imgE = 20 + 256 * 16 * 2, clutF = 20, imgF = 20 + 256 * 2 * 2;
    e.set(fbdBytes.subarray(clutF, clutF + 1024), clutE + 14 * 512);
    for (let y = 0; y < 256; y++) e.set(fbdBytes.subarray(imgF + y * 64, imgF + (y + 1) * 64), imgE + y * 384);
    return e;
  }
  const api = { RIDERS, TW, TH, readPMD, readFBD, writeFBD, palMap, toRGBA, fromRGBA, patchEnemy, c2rgb };
  if (typeof module !== 'undefined') module.exports = api; else root.CB2 = api;
})(this);
