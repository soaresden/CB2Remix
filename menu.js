// In-game menu preview of skins: the WEAR / BOARDER screen model (TITLE/CHR.DAT, one TMD + 3 jacket and
// 3 pants 8bpp TIMs per rider) gets the colours painted on the race texture, transferred surface to surface.
(function (root) {
  // menu pose of the 13 model parts (world matrix captured in the game's menu): [r00..r22 (x4096), tx, ty, tz]
  const POSE = {"0":[[-1022,-521,3924,-188,4058,489,-3954,-59,-1038,128,-982,9281],[3059,0,2717,0,4096,0,-2718,0,3059,66,-993,9343],[3059,0,2717,0,4096,0,-2718,0,3059,66,-994,9344],[2948,296,2819,-225,4084,-195,-2828,-14,2957,44,-976,9351],[2948,1061,2627,-225,3870,-1314,-2828,801,2845,-121,-955,9177],[969,-2987,2614,-475,2587,3132,-3943,-1047,266,252,-823,9344],[1654,2424,2841,-359,3200,-2522,-3720,772,1509,-830,-1069,9003],[2995,615,2717,-824,4011,0,-2662,-547,3059,-120,-900,9533],[2176,615,3406,-795,4011,-217,-3370,-547,2252,-61,-906,9560],[2195,541,3406,-660,4034,-217,-3386,-434,2252,-14,-931,9486],[3059,-15,2717,19,4096,0,-2718,12,3059,65,-973,9329],[3392,-15,2285,18,4096,-3,-2287,12,3393,70,-973,9352],[3392,-15,2285,18,4096,-3,-2287,12,3393,70,-973,9352]],"1":[[-3372,123,2313,317,4070,244,-2298,381,-3361,46,-993,9127],[-3038,401,2712,68,4058,-526,-2742,-345,-3016,36,-1004,9181],[-3264,581,2398,0,3979,-965,-2470,-769,-3171,-12,-993,9282],[-3723,125,1688,293,4065,343,-1670,434,-3706,107,-1012,9006],[-3723,471,1625,293,4046,-507,-1670,-343,-3715,32,-1027,9168],[-3246,-123,2487,297,4036,584,-2475,645,-3189,76,-973,9087],[-2847,-226,2929,-108,4080,207,-2937,68,-2841,146,-1029,9171],[-3472,-618,2072,-530,4043,317,-2100,1,-3510,397,-950,8994],[-3739,-606,1541,-517,4042,336,-1577,114,-3771,397,-951,8902],[-3757,-480,1541,-381,4056,336,-1573,167,-3771,315,-969,8866],[-3030,98,2747,319,4073,206,-2733,366,-3021,150,-966,8918],[-3006,69,2776,390,4058,321,-2751,499,-2984,165,-954,8852],[-3006,69,2776,390,4058,321,-2751,499,-2984,165,-955,8850]],"2":[[-1292,-39,-3884,165,4087,-95,3876,-190,-1291,26,-963,9152],[-1269,-247,-3884,-499,4061,-95,3857,441,-1291,41,-963,9110],[-1388,166,-3848,489,4066,0,3818,-460,-1398,-50,-965,9315],[-1084,668,-3889,-142,4021,730,3941,325,-1047,-72,-973,9120],[-1084,578,-3904,-142,4036,637,3941,300,-1055,-55,-977,9124],[-682,2145,-3415,1146,3420,1921,3862,-639,-1177,-173,-771,9227],[603,-3184,-2494,-327,2471,-3236,4027,669,111,1020,-793,9000],[-1365,-322,-3847,-601,4049,-126,3811,522,-1398,96,-935,9024],[-1365,44,-3860,-601,4042,259,3811,652,-1342,-84,-928,8960],[-1365,44,-3860,-601,4042,259,3811,652,-1342,-86,-929,8959],[-1385,180,-3848,12,4091,188,3851,51,-1385,-61,-972,9172],[-1385,68,-3852,12,4094,69,3851,10,-1386,-8,-974,9192],[-1385,91,-3852,12,4093,93,3851,18,-1386,-23,-974,9187]],"3":[[3972,-760,-619,754,4016,-63,611,-54,4042,-18,-848,9240],[4040,248,-608,-282,4076,-189,589,226,4040,-84,-856,9222],[4045,-16,-632,145,4005,836,611,-848,3956,-24,-846,9465],[4039,-448,-475,604,3633,1764,222,-1813,3655,-7,-845,9464],[3749,-1373,878,872,3557,1800,-1377,-1464,3555,219,-856,9552],[3875,1162,-609,-713,3445,2077,1097,-1865,3465,-192,-789,9469],[2510,2082,-2463,-1073,3475,1853,3032,-500,2683,-529,-833,9372],[4031,-353,-625,252,4035,-651,668,602,3992,83,-866,9037],[4080,-335,35,335,4064,-362,-11,362,4074,77,-881,9185],[4080,-337,-3,335,4078,87,-11,-89,4087,78,-892,9483],[4046,202,-590,-121,4054,564,609,-540,4011,-91,-862,9400],[3754,146,-1623,-69,4087,213,1624,-170,3750,-79,-878,9263],[3754,200,-1617,-69,4076,350,1624,-297,3741,-115,-871,9345]]};
  const le32 = (d, o) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
  const le16 = (d, o) => d[o] | (d[o + 1] << 8);
  const s16 = (d, o) => { const v = le16(d, o); return v & 0x8000 ? v - 0x10000 : v; };
  // ---- CHR.DAT layout: per rider 0..3, TIM blocks (CLUT + image) upper j / lower p, then the TMD
  function scan(chr) {
    const riders = [];
    const blocks = [];
    for (let o = 0; o + 12 < chr.length; o += 2) {
      const L = le32(chr, o), x = le16(chr, o + 4), y = le16(chr, o + 6), w = le16(chr, o + 8), h = le16(chr, o + 10);
      if (w && h && L === 12 + w * h * 2 && x < 1024 && y < 512 && L > 200) { blocks.push({ o, x, y, w, h }); o += L - 2; }
    }
    // pairs (clut 256x1, image 64 x 144|112)
    const tims = [];
    for (let i = 0; i + 1 < blocks.length; i++) if (blocks[i].w === 256 && blocks[i].h === 1 && blocks[i + 1].w === 64) { tims.push({ clut: blocks[i], img: blocks[i + 1] }); i++; }
    for (let r = 0; r < 4; r++) {
      const x0 = 512 + 64 * r, mine = tims.filter((t) => t.img.x === x0);
      const up = mine.filter((t) => t.img.y === 0), lo = mine.filter((t) => t.img.y === 144);
      const after = mine[mine.length - 1].img.o + 12 + 64 * 2 * mine[mine.length - 1].img.h;
      let tmd = -1; for (let o = after; o < chr.length; o += 4) if (le32(chr, o) === 0x41 && le32(chr, o + 8) === 13) { tmd = o; break; }
      riders.push({ x0, up, lo, tmd });
    }
    return riders;
  }
  function readTMD(d, base) {
    const n = le32(d, base + 8), objs = [];
    for (let k = 0; k < n; k++) {
      const o = base + 12 + 28 * k, vt = le32(d, o), nv = le32(d, o + 4), pt = le32(d, o + 16), np = le32(d, o + 20);
      const verts = []; for (let i = 0; i < nv; i++) verts.push([s16(d, base + 12 + vt + 8 * i), s16(d, base + 14 + vt + 8 * i), s16(d, base + 16 + vt + 8 * i)]);
      const prims = []; let q = base + 12 + pt;
      for (let i = 0; i < np; i++) {
        const ilen = d[q + 1], mode = d[q + 3], b = q + 4;
        const tex = mode & 4, quad = mode & 8, gour = mode & 0x10, nvp = quad ? 4 : 3;
        if (tex && (mode & 0xe0) === 0x20) {
          const uv = [], idx = [];
          for (let v = 0; v < nvp; v++) uv.push([d[b + 4 * v], d[b + 4 * v + 1]]);
          const tp = le16(d, b + 6); let p = b + 4 * nvp;
          if (gour) for (let v = 0; v < nvp; v++) { idx.push(le16(d, p + 2)); p += 4; }
          else { idx.push(le16(d, p + 2)); for (let v = 1; v < nvp; v++) idx.push(le16(d, p + 4 + 2 * (v - 1))); }
          prims.push({ k, uv, idx, tp });
        }
        q += 4 + ilen * 4;
      }
      objs.push({ verts, prims });
    }
    return objs;
  }
  const mul = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
  const mulT = (R, v) => [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];
  function posed(objs, r) {
    const P = POSE[r]; let ref = 0; objs.forEach((o, k) => { if (o.verts.length > objs[ref].verts.length) ref = k; });
    const R0 = P[ref].slice(0, 9).map((x) => x / 4096), t0 = P[ref].slice(9);
    return objs.map((o, k) => { const R = P[k].slice(0, 9).map((x) => x / 4096), t = P[k].slice(9);
      return o.verts.map((v) => { const w = mul(R, v); return mulT(R0, [w[0] + t[0] - t0[0], w[1] + t[1] - t0[1], w[2] + t[2] - t0[2]]); }); });
  }
  function closest(p, a, b, c) { // barycentrics of the closest point (Ericson)
    const sub = (x, y) => [x[0] - y[0], x[1] - y[1], x[2] - y[2]], dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
    if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) return [0, 1, 0];
    const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [1 - v, v, 0]; }
    const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
    if (d6 >= 0 && d5 <= d6) return [0, 0, 1];
    const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [1 - w, 0, w]; }
    const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [0, 1 - w, w]; }
    const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; return [1 - v - w, v, w];
  }
  // race model parts (PMD, sideways stance) turned to face the camera like the menu model
  function raceParts(prims) {
    // PMD objects are not kept by CB2.readPMD -> group by contiguous prims sharing vertices is not needed: use the whole model
    return prims.filter((t) => t.tex && (t.tp & 0xf) === 9).flatMap((t) => {
      const rot = (v) => [v[2], v[1], -v[0]];
      const T = [[rot(t.v[0]), rot(t.v[1]), rot(t.v[2]), t.uv[0], t.uv[1], t.uv[2], t.obj]];
      if (t.nv === 4) T.push([rot(t.v[1]), rot(t.v[3]), rot(t.v[2]), t.uv[1], t.uv[3], t.uv[2], t.obj]);
      return T;
    });
  }
  // texel map: for each menu texel (upper TIM 128x144 then lower 128x112 = 128x256) -> race texel index, -1 = none
  function buildMap(chr, r, racePrims) {
    const R = scan(chr)[r], objs = readTMD(chr, R.tmd), V = posed(objs, r);
    const tris = raceParts(racePrims);
    // global fit (height + feet + centre)
    const ext = (pts) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const p of pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); } return [lo, hi]; };
    const allM = V.flat(), allP = tris.flatMap((t) => [t[0], t[1], t[2]]);
    const [mlo, mhi] = ext(allM), [plo, phi] = ext(allP), s = (mhi[1] - mlo[1]) / (phi[1] - plo[1]);
    const mean = (pts, i) => pts.reduce((a, p) => a + p[i], 0) / pts.length;
    const cm = [mean(allM, 0), mhi[1], mean(allM, 2)], cp = [mean(allP, 0), phi[1], mean(allP, 2)];
    const toM = (p) => [(p[0] - cp[0]) * s + cm[0], (p[1] - cp[1]) * s + cm[1], (p[2] - cp[2]) * s + cm[2]];
    // parts: race objects -> centroid; menu object k -> nearest race object
    const objIds = [...new Set(tris.map((t) => t[6]))];
    const partTris = new Map(objIds.map((id) => [id, tris.filter((t) => t[6] === id).map((t) => [toM(t[0]), toM(t[1]), toM(t[2]), t[3], t[4], t[5]])]));
    const cen = (pts) => [mean(pts, 0), mean(pts, 1), mean(pts, 2)];
    const pc = new Map([...partTris].map(([id, T]) => [id, cen(T.flatMap((t) => [t[0], t[1], t[2]]))]));
    const map = new Int32Array(128 * 256).fill(-1);
    objs.forEach((o, k) => {
      const c = cen(V[k]); let best = null, bd = 1e18;
      for (const [id, q] of pc) { const dd = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2; if (dd < bd) { bd = dd; best = id; } }
      const T = partTris.get(best);
      // per-part box fit
      const [a0, a1] = ext(V[k]), [b0, b1] = ext(T.flatMap((t) => [t[0], t[1], t[2]]));
      const fit = (p) => [0, 1, 2].map((i) => (a1[i] - a0[i] > 1 ? (p[i] - a0[i]) / (a1[i] - a0[i]) * (b1[i] - b0[i]) + b0[i] : p[i]));
      for (const pr of o.prims) {
        const tpx = (pr.tp & 0xf) * 64, tpy = ((pr.tp >> 4) & 1) * 256;
        const tri = [[0, 1, 2]]; if (pr.idx.length === 4) tri.push([1, 3, 2]);
        for (const [i0, i1, i2] of tri) {
          const U = [pr.uv[i0], pr.uv[i1], pr.uv[i2]], X = [V[k][pr.idx[i0]], V[k][pr.idx[i1]], V[k][pr.idx[i2]]];
          if (X.some((x) => !x)) continue;
          const A = [U[1][0] - U[0][0], U[2][0] - U[0][0], U[1][1] - U[0][1], U[2][1] - U[0][1]], det = A[0] * A[3] - A[1] * A[2];
          if (Math.abs(det) < 1e-6) continue;
          const ux0 = Math.min(U[0][0], U[1][0], U[2][0]), ux1 = Math.max(U[0][0], U[1][0], U[2][0]), uy0 = Math.min(U[0][1], U[1][1], U[2][1]), uy1 = Math.max(U[0][1], U[1][1], U[2][1]);
          for (let ty = uy0; ty <= uy1; ty++) for (let tx = ux0; tx <= ux1; tx++) {
            const px = tx + 0.5 - U[0][0], py = ty + 0.5 - U[0][1];
            const l1 = (A[3] * px - A[1] * py) / det, l2 = (-A[2] * px + A[0] * py) / det, l0 = 1 - l1 - l2;
            if (l0 < -0.05 || l1 < -0.05 || l2 < -0.05) continue;
            const gx = (tpx - R.x0) * 2 + tx, gy = tpy + ty; if (gx < 0 || gx >= 128 || gy < 0 || gy >= 256) continue;
            if (map[gy * 128 + gx] >= 0) continue;
            const p = fit([0, 1, 2].map((i) => l0 * X[0][i] + l1 * X[1][i] + l2 * X[2][i]));
            let bb = null, bdist = 1e18;
            for (const t of T) { const w = closest(p, t[0], t[1], t[2]); const q = [0, 1, 2].map((i) => w[0] * t[0][i] + w[1] * t[1][i] + w[2] * t[2][i]); const dd = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
              if (dd < bdist) { bdist = dd; bb = [w[0] * t[3][0] + w[1] * t[4][0] + w[2] * t[5][0], w[0] * t[3][1] + w[1] * t[4][1] + w[2] * t[5][1]]; } }
            if (bb) map[gy * 128 + gx] = Math.min(255, Math.floor(bb[1])) * 128 + Math.min(127, Math.floor(bb[0]));
          }
        }
      }
    });
    return { map, objs, V, R };
  }
  // menu TIM (8bpp) <-> RGBA
  function timRGBA(chr, t) {
    const pal = []; for (let i = 0; i < 256; i++) pal.push(le16(chr, t.clut.o + 12 + 2 * i));
    const w = t.img.w * 2, h = t.img.h, o = t.img.o + 12, out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { const c = pal[chr[o + i]]; out[i * 4] = (c & 31) << 3; out[i * 4 + 1] = ((c >> 5) & 31) << 3; out[i * 4 + 2] = ((c >> 10) & 31) << 3; out[i * 4 + 3] = c === 0 ? 0 : 255; }
    return out;
  }
  function writeTIM(chr, t, rgba, quant) { // requantize to 256 colours (transparent texels keep a 0x0000 entry)
    const w = t.img.w * 2, h = t.img.h, n = w * h, px = [], trans = [];
    for (let i = 0; i < n; i++) { if (rgba[i * 4 + 3] < 128) trans.push(i); else px.push([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], i]); }
    const cols = quant(px.map((p) => p.slice(0, 3)), trans.length ? 255 : 256), k0 = trans.length ? 1 : 0;
    const co = t.clut.o + 12; if (k0) { chr[co] = 0; chr[co + 1] = 0; }
    cols.forEach((c, k) => { let v = (c[0] >> 3) | ((c[1] >> 3) << 5) | ((c[2] >> 3) << 10); if (!v) v = 0x0421; chr[co + 2 * (k + k0)] = v & 255; chr[co + 2 * (k + k0) + 1] = v >> 8; });
    const io = t.img.o + 12; for (const i of trans) chr[io + i] = 0;
    // nearest colour via a small cache
    const cache = new Map();
    for (const p of px) { const key = (p[0] >> 2) << 12 | (p[1] >> 2) << 6 | (p[2] >> 2); let b = cache.get(key);
      if (b === undefined) { let bd = 1e9; b = 0; cols.forEach((c, k) => { const dd = (c[0] - p[0]) ** 2 * 3 + (c[1] - p[1]) ** 2 * 4 + (c[2] - p[2]) ** 2 * 2; if (dd < bd) { bd = dd; b = k; } }); cache.set(key, b); }
      chr[io + p[3]] = b + k0; }
  }
  // paint the skin into the menu textures (upper = jacket j, lower = pants p): only texels whose race texel is painted
  // menuRGBA: {up: rgba 128x144, lo: rgba 128x112} originals ; over/orig: race overlay + race original (128x256 RGBA)
  function apply(map, menuUp, menuLo, over, orig) {
    const up = new Uint8ClampedArray(menuUp), lo = new Uint8ClampedArray(menuLo); let n = 0;
    for (let g = 0; g < 128 * 256; g++) {
      const ri = map[g]; if (ri < 0 || !over[ri * 4 + 3]) continue;
      const dst = g < 128 * 144 ? up : lo, di = (g < 128 * 144 ? g : g - 128 * 144) * 4;
      if (!dst[di + 3]) continue;
      const Lm = 0.3 * dst[di] + 0.59 * dst[di + 1] + 0.11 * dst[di + 2] + 8, Lr = 0.3 * orig[ri * 4] + 0.59 * orig[ri * 4 + 1] + 0.11 * orig[ri * 4 + 2] + 8;
      const k = Math.max(0.7, Math.min(1.35, Lm / Lr));
      dst[di] = over[ri * 4] * k; dst[di + 1] = over[ri * 4 + 1] * k; dst[di + 2] = over[ri * 4 + 2] * k; n++;
    }
    return { up, lo, n };
  }
  const api = { scan, readTMD, posed, buildMap, timRGBA, writeTIM, apply };
  if (typeof module !== 'undefined') module.exports = api; else root.MenuSkin = api;
})(this);
