// CB2 Remix – Atelier : UI
(() => {
  const $ = (s) => document.querySelector(s);
  const { RIDERS, TW, TH } = CB2;
  const t = I18N.t;
  const slotLabel = (s) => t(...s.lab);
  const S = { disc: null, file: null, models: {}, slots: {}, cur: null, tool: 'brush', hist: [] };
  const log = (t) => { $('#log').textContent += t + '\n'; $('#log').scrollTop = 1e9; };

  // ---------- open disc
  const drop = $('#drop');
  drop.onclick = () => $('#file').click();
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('hov'); };
  drop.ondragleave = () => drop.classList.remove('hov');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('hov'); if (e.dataTransfer.files[0]) openFile(e.dataTransfer.files[0]); };
  $('#file').onchange = (e) => e.target.files[0] && openFile(e.target.files[0]);
  $('#file2').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openFile(f); };
  const _P = {};
  async function remixPatch(us) { // CB2D delta, gzip + base64 in patches.js (us: the USA version's one)
    const k = us ? 'REMIX_US' : 'REMIX';
    if (!_P[k]) { const b = Uint8Array.from(atob(window[k].delta), (c) => c.charCodeAt(0));
      _P[k] = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()); }
    return _P[k];
  }
  const u32 = (P, o) => (P[o] | (P[o + 1] << 8) | (P[o + 2] << 16) | (P[o + 3] << 24)) >>> 0;
  function remixLoc(exe) { // Remix extras (competition textures of Gray / Snowman), null on a non-Remix exe
    const o = 0x800 + 0x8004f900 - 0x80010000, bcd = (b) => (b >> 4) * 10 + (b & 15);
    const L = ['gray', 'snow', 'eg', 'es'].reduce((m, k, i) => { const p = o + i * 8; const lba = (bcd(exe[p]) * 60 + bcd(exe[p + 1])) * 75 + bcd(exe[p + 2]) - 150; const size = exe[p + 4] | (exe[p + 5] << 8) | (exe[p + 6] << 16); m[k] = { lba, size }; return m; }, {});
    return L.eg.size ? L : null;
  }
  async function openFile(f) {
    $('#log').textContent = '';
    try {
      log(t('opening', f.name, (f.size / 1048576).toFixed(0)));
      const read = async (a, b) => new Uint8Array(await f.slice(a, b).arrayBuffer());
      const d = await Disc.open(read, f.size, f.name);
      if (!d.files['/DATA/CHR/FR/1P/FRM1.PMD']) throw new Error(t('notCB2'));
      S.disc = d; S.file = f; if (window.CB2Music) CB2Music.setDisc(d, f.name); S.slots = {}; S.models = {}; S.cur = null; S.hist = []; S.patchedName = null;
      log(t('discOK', d.kind.toUpperCase(), Object.keys(d.files).length));
      // Remix extras (competition textures of Gray / Snowman)
      S.state = 'other'; S.cfgOnDisc = null;
      try {
        S.cfgOnDisc = await d.readConfig();
        if (S.cfgOnDisc) { S.state = 'remix'; S.loc = remixLoc(await d.readFile('/SCES_009.92')); throw 0; }
        const exeName = await d.bootExe(), exe = await d.readFile(exeName);
        if (exeName === '/SCUS_943.58') { // USA version
          const P = await remixPatch(true), o = 0x800 + 0x8004f538 - 0x80010000;
          S.loc = null; S.state = (exe[o] | exe[o + 1] | exe[o + 2] | exe[o + 3]) ? 'remix-us' : exe.length === u32(P, 12) && d.crc32(exe) === u32(P, 8) ? 'original-us' : 'other';
        } else { S.loc = remixLoc(exe);
          if (S.loc) S.state = 'remix';
          else { const P = await remixPatch(); if (exe.length === u32(P, 12) && d.crc32(exe) === u32(P, 8)) S.state = 'original'; } }
      } catch (e) { if (e !== 0) S.loc = null; }
      try { S.chr = await d.readFile('/TITLE/CHR.DAT'); S.menu = MenuSkin.scan(S.chr); } catch (e) { S.chr = null; }
      S.menuMaps = {};
      $('#discname').textContent = f.name; discState();
      $('#drop').style.display = 'none'; $('#discline').style.display = 'flex';
      BD.init(); showTab();
      buildList(); initGL(); await selectSlot(RIDERS[0], RIDERS[0].slots[0]);
    } catch (e) { log(t('error', e.message)); console.error(e); }
  }

  // ---------- in-page dialogs
  function dialog(title, body, buttons) { // buttons: [[label, value, primary?]] -> Promise(value | null)
    return new Promise((done) => {
      const m = $('#dlg'); $('#dlgTitle').textContent = title; const b = $('#dlgBody'); b.innerHTML = '';
      if (typeof body === 'string') { const p = document.createElement('p'); p.className = 'mut'; p.textContent = body; b.appendChild(p); } else if (body) b.appendChild(body);
      const acts = $('#dlgActs'); acts.innerHTML = '';
      const close = (v) => { m.style.display = 'none'; document.removeEventListener('keydown', key); done(v); };
      const key = (e) => { if (e.key === 'Escape') close(null); };
      for (const [lab, v, pri] of buttons) { const x = document.createElement('button'); x.textContent = lab; if (pri) x.className = 'pri'; x.onclick = () => close(typeof v === 'function' ? v() : v); acts.appendChild(x); }
      m.onclick = (e) => { if (e.target === m) close(null); };
      document.addEventListener('keydown', key); m.style.display = 'flex';
      const first = b.querySelector('input') || acts.lastChild; if (first) first.focus();
    });
  }
  const say = (msg) => dialog('Cool Boarders 2 Remix', msg, [[t('ok'), true, true]]);
  S.dialog = dialog;

  // ---------- rider / slot list
  function buildList() {
    const el = $('#riders'); el.innerHTML = '';
    for (const r of RIDERS) {
      const h = document.createElement('h3'); h.textContent = r.name; el.appendChild(h);
      for (const s of r.slots) {
        const d = document.createElement('div'); d.className = 'slot'; d.dataset.id = s.id;
        d.innerHTML = '<span class="dot"></span><span></span>'; d.lastChild.textContent = slotLabel(s);
        d.onclick = () => selectSlot(r, s); el.appendChild(d);
      }
    }
  }
  function markList() {
    document.querySelectorAll('.slot').forEach((d) => { d.classList.toggle('on', S.cur && d.dataset.id === S.cur.s.id); d.classList.toggle('mod', !!(S.slots[d.dataset.id] && S.slots[d.dataset.id].dirty)); });
    $('#btnBuild').disabled = !Object.values(S.slots).some((x) => x.dirty);
  }
  async function getModel(path) {
    if (!S.models[path]) { const prims = CB2.readPMD(await S.disc.readFile(path)); S.models[path] = { prims, pm: CB2.palMap(prims) }; }
    return S.models[path];
  }
  async function getSlot(r, s) {
    if (!S.slots[s.id]) {
      const m = await getModel(r.model); const f = CB2.readFBD(await S.disc.readFile(s.file));
      S.slots[s.id] = { r, s, m, f, orig: CB2.toRGBA(f, m.pm), over: new Uint8ClampedArray(TW * TH * 4), dirty: false };
    }
    return S.slots[s.id];
  }
  async function selectSlot(r, s) {
    S.cur = await getSlot(r, s); S.hist = [];
    $('#title').textContent = r.name + ' — ' + slotLabel(s);
    setModel(S.cur.m); redraw(); markList();
  }

  // ---------- texture composite & 2D editor
  const ZOOM = 3, tex = $('#tex'); tex.width = TW * ZOOM; tex.height = TH * ZOOM;
  const tctx = tex.getContext('2d');
  const small = document.createElement('canvas'); small.width = TW; small.height = TH; const sctx = small.getContext('2d');
  function composite(sl = S.cur) {
    const out = new Uint8ClampedArray(sl.orig);
    for (let i = 0; i < TW * TH; i++) if (sl.over[i * 4 + 3] && sl.m.pm[i] >= 0) { out[i * 4] = sl.over[i * 4]; out[i * 4 + 1] = sl.over[i * 4 + 1]; out[i * 4 + 2] = sl.over[i * 4 + 2]; out[i * 4 + 3] = 255; }
    return out;
  }
  const RIDX = (r) => RIDERS.indexOf(r);
  const menuSlot = (sl) => S.chr && RIDX(sl.r) < 4 && sl.s.lab[0] === 'combo' ? { r: RIDX(sl.r), j: sl.s.lab[1] - 1, p: sl.s.lab[2] - 1 } : null;
  function menuMap(r) { if (!S.menuMaps[r]) S.menuMaps[r] = MenuSkin.buildMap(S.chr, r, S.cur.m.prims); return S.menuMaps[r]; }
  // menu textures (upper TIM j over rows 0-143, lower TIM p over rows 144-255) with the given skins applied
  function menuTextures(r, j, p, slots) {
    const R = S.menu[r]; let up = MenuSkin.timRGBA(S.chr, R.up[j]), lo = MenuSkin.timRGBA(S.chr, R.lo[p]);
    for (const sl of slots) { const ms = menuSlot(sl); if (!ms || ms.r !== r) continue;
      const map = S.menuMaps[r] || (S.menuMaps[r] = MenuSkin.buildMap(S.chr, r, sl.m.prims));
      const res = MenuSkin.apply(map.map, up, lo, sl.over, sl.orig);
      if (ms.j === j) up = res.up; if (ms.p === p) lo = res.lo; }
    return { up, lo };
  }
  function redraw() {
    const c = composite(); sctx.putImageData(new ImageData(c, TW, TH), 0, 0);
    tctx.imageSmoothingEnabled = false; tctx.clearRect(0, 0, tex.width, tex.height); tctx.drawImage(small, 0, 0, tex.width, tex.height);
    if ($('#uvs').checked) {
      tctx.strokeStyle = 'rgba(61,181,255,.55)'; tctx.lineWidth = 1;
      for (const p of S.cur.m.prims) { if (!p.tex || (p.tp & 0xf) !== 9) continue; const u = p.nv === 4 ? [p.uv[0], p.uv[1], p.uv[3], p.uv[2]] : p.uv; tctx.beginPath(); u.forEach(([x, y], k) => (k ? tctx.lineTo : tctx.moveTo).call(tctx, x * ZOOM + 1.5, y * ZOOM + 1.5)); tctx.closePath(); tctx.stroke(); }
    }
    if (glTex) {
      glCanvasCtx.clearRect(0, 0, TW, TH);
      if (S.view === 'menu' && menuSlot(S.cur)) { const ms = menuSlot(S.cur), tx = menuTextures(ms.r, ms.j, ms.p, [S.cur]);
        glCanvasCtx.putImageData(new ImageData(tx.up, 128, 144), 0, 0); glCanvasCtx.putImageData(new ImageData(tx.lo, 128, 112), 0, 144); }
      else glCanvasCtx.drawImage(small, 0, 0);
      glTex.needsUpdate = true;
    }
  }
  $('#uvs').onchange = redraw;
  document.querySelectorAll('#tools .t').forEach((b) => (b.onclick = () => { document.querySelectorAll('#tools .t').forEach((x) => x.classList.remove('on')); b.classList.add('on'); S.tool = b.dataset.tool; }));
  const SW = ['#000000', '#ffffff', '#3a3a3a', '#8a8a8a', '#c8102e', '#ff8a3d', '#f2c14e', '#4fd18b', '#2e86de', '#1b3a6b', '#8e44ad', '#f4a6c0', '#f1c9a5', '#d9a07a', '#a86b45', '#5b3a24', '#e07a2e', '#fbe3c8'];
  SW.forEach((c) => { const i = document.createElement('i'); i.style.background = c; i.title = c; i.onclick = () => ($('#color').value = c); $('#swatches').appendChild(i); });
  const hex2 = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const pushHist = () => { S.hist.push(S.cur.over.slice()); if (S.hist.length > 40) S.hist.shift(); };
  function paintAt(x, y) {
    const sl = S.cur, sz = +$('#size').value, [r, g, b] = hex2($('#color').value), h = Math.floor((sz - 1) / 2);
    for (let yy = y - h; yy < y - h + sz; yy++) for (let xx = x - h; xx < x - h + sz; xx++) {
      if (xx < 0 || yy < 0 || xx >= TW || yy >= TH || sl.m.pm[yy * TW + xx] < 0) continue;
      const i = (yy * TW + xx) * 4;
      if (S.tool === 'erase') sl.over[i + 3] = 0;
      else if (S.tool === 'tint') { const o = sl.orig, L = (0.3 * o[i] + 0.59 * o[i + 1] + 0.11 * o[i + 2]) / 160; sl.over[i] = Math.min(255, r * L); sl.over[i + 1] = Math.min(255, g * L); sl.over[i + 2] = Math.min(255, b * L); sl.over[i + 3] = 255; }
      else { sl.over[i] = r; sl.over[i + 1] = g; sl.over[i + 2] = b; sl.over[i + 3] = 255; }
    }
  }
  function fillAt(x, y) {
    const sl = S.cur, c = composite(), [r, g, b] = hex2($('#color').value), i0 = y * TW + x;
    if (sl.m.pm[i0] < 0) return;
    const tol = +$('#tol').value, near = (i) => Math.abs(c[i * 4] - c[i0 * 4]) + Math.abs(c[i * 4 + 1] - c[i0 * 4 + 1]) + Math.abs(c[i * 4 + 2] - c[i0 * 4 + 2]) <= tol;
    const seen = new Uint8Array(TW * TH), st = [i0], tint = $('#filltint').checked, o = sl.orig;
    while (st.length) { const i = st.pop(); if (seen[i]) continue; seen[i] = 1; if (sl.m.pm[i] < 0 || !near(i)) continue;
      const L = tint ? (0.3 * o[i * 4] + 0.59 * o[i * 4 + 1] + 0.11 * o[i * 4 + 2]) / 160 : 1;
      sl.over[i * 4] = Math.min(255, r * L); sl.over[i * 4 + 1] = Math.min(255, g * L); sl.over[i * 4 + 2] = Math.min(255, b * L); sl.over[i * 4 + 3] = 255;
      const X = i % TW, Y = (i / TW) | 0; if (X > 0) st.push(i - 1); if (X < TW - 1) st.push(i + 1); if (Y > 0) st.push(i - TW); if (Y < TH - 1) st.push(i + TW); }
  }
  let drawing = false;
  const texel = (e) => { const r = tex.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * TW), Math.floor((e.clientY - r.top) / r.height * TH)]; };
  tex.onpointerdown = (e) => {
    if (!S.cur) return; const [x, y] = texel(e);
    if (S.tool === 'pick') { const c = composite(); const i = (y * TW + x) * 4; $('#color').value = '#' + [c[i], c[i + 1], c[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''); return; }
    pushHist();
    if (S.tool === 'fill') { fillAt(x, y); changed(); return; }
    drawing = true; tex.setPointerCapture(e.pointerId); last = null; strokeTo(x, y); changed();
  };
  let last = null;
  const strokeTo = (x, y) => { if (last) { const n = Math.max(Math.abs(x - last[0]), Math.abs(y - last[1])); for (let k = 1; k <= n; k++) paintAt(Math.round(last[0] + (x - last[0]) * k / n), Math.round(last[1] + (y - last[1]) * k / n)); } else paintAt(x, y); last = [x, y]; };
  tex.onpointermove = (e) => { if (drawing) { const [x, y] = texel(e); strokeTo(x, y); changed(); } };
  tex.onpointerup = () => { drawing = false; last = null; };
  S.paintUV = (x, y, down) => { // painting from the 3D view
    if (S.tool === 'pick') { const c = composite(); const i = (y * TW + x) * 4; $('#color').value = '#' + [c[i], c[i + 1], c[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''); return; }
    if (down) { pushHist(); last = null; if (S.tool === 'fill') { fillAt(x, y); changed(); return; } }
    if (S.tool !== 'fill') { if (last && Math.abs(last[0] - x) + Math.abs(last[1] - y) > 12) last = null; strokeTo(x, y); changed(); }
  };
  S.endUV = () => { last = null; };
  function changed() { S.cur.dirty = S.cur.over.some((v, i) => (i & 3) === 3 && v); redraw(); markList(); }
  $('#undo').onclick = () => { if (S.hist.length) { S.cur.over = S.hist.pop(); changed(); } };
  $('#reset').onclick = async () => { if (await dialog(t('resetTitle'), t('confirmReset'), [[t('cancel'), false], [t('reset'), true, true]])) { pushHist(); S.cur.over.fill(0); changed(); } };
  // template export / PNG import (same size as the texture, or any multiple)
  $('#tpl').onclick = () => { const c = document.createElement('canvas'); c.width = TW; c.height = TH; c.getContext('2d').putImageData(new ImageData(composite(), TW, TH), 0, 0);
    c.toBlob((b) => dl(b, `${S.cur.s.id}_${t('templateSuffix')}.png`)); };
  $('#imp').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return; e.target.value = '';
    const img = await loadImg(URL.createObjectURL(f)); const c = document.createElement('canvas'); c.width = TW; c.height = TH;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, TW, TH); const p = x.getImageData(0, 0, TW, TH).data;
    pushHist(); const o = S.cur.orig, ov = S.cur.over;
    for (let i = 0; i < TW * TH; i++) { const a = i * 4; if (p[a + 3] < 128) continue; const same = Math.abs(p[a] - o[a]) + Math.abs(p[a + 1] - o[a + 1]) + Math.abs(p[a + 2] - o[a + 2]) < 6;
      if (same) ov[a + 3] = 0; else { ov[a] = p[a]; ov[a + 1] = p[a + 1]; ov[a + 2] = p[a + 2]; ov[a + 3] = 255; } }
    changed();
  };
  const loadImg = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
  function dl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); }

  // ---------- skin files: only the painted texels are stored (never the game's own pixels)
  $('#saveSkin').onclick = async () => {
    if (!S.cur.dirty) return say(t('noEdit'));
    let prev = ''; try { prev = localStorage.getItem('cb2author') || ''; } catch (e) {}
    const form = document.createElement('div');
    form.innerHTML = '<p class="mut"></p><label></label><input type="text" id="dlgName" maxlength="60"><label></label><input type="text" id="dlgAuthor" maxlength="40">';
    form.children[0].textContent = t('replacesLbl') + ' : ' + S.cur.r.name + ' — ' + slotLabel(S.cur.s);
    form.children[1].textContent = t('nameLbl'); form.children[2].value = t('skinDefault'); form.children[3].textContent = t('authorLbl'); form.children[4].value = prev;
    const res = await dialog(t('skinTitle'), form, [[t('cancel'), null], [t('save'), () => [form.children[2].value.trim(), form.children[4].value.trim()], true]]);
    if (!res || !res[0]) return; const [name, author] = res;
    try { localStorage.setItem('cb2author', author); } catch (e) {}
    const c = document.createElement('canvas'); c.width = TW; c.height = TH; c.getContext('2d').putImageData(new ImageData(S.cur.over.slice(), TW, TH), 0, 0);
    const j = { format: 'cb2skin', version: 1, name, author, rider: S.cur.r.id, slot: S.cur.s.id, replaces: S.cur.r.name + ' — ' + slotLabel(S.cur.s), png: c.toDataURL('image/png') };
    dl(new Blob([JSON.stringify(j, null, 1)], { type: 'application/json' }), name.replace(/[^\w\- ]+/g, '_') + '.cb2skin.json');
  };
  async function applySkin(j) {
    if (j.format !== 'cb2skin') throw new Error(t('unknownSkin'));
    const r = RIDERS.find((x) => x.id === j.rider), s = r && r.slots.find((x) => x.id === j.slot);
    if (!s) throw new Error(t('unknownSlot', j.slot));
    await selectSlot(r, s);
    if (j.recipe) { pushHist(); recolor(S.cur.orig, S.cur.over, j.recipe); changed(); return; }
    const img = await loadImg(j.png); const c = document.createElement('canvas'); c.width = TW; c.height = TH; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    pushHist(); S.cur.over.set(x.getImageData(0, 0, TW, TH).data); changed();
  }
  // ---- recipe outfits (version 2): a colour transformation applied to the player's own texture (no game pixels stored).
  // recipe = { op: 'hue' (deg, sat, light) | 'duo' (a, b: dark / light colours) | 'mono' (contrast) | 'tri' (a, b, c),
  //            keepSkin (default true): skin-like colours are left alone }
  function recolor(orig, over, R) {
    const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
      if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
    const rgb = (h, s, l) => { const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; };
    const mix = (p, q, t) => p.map((v, i) => Math.round(v + (q[i] - v) * t));
    const keep = R.keepSkin !== false;
    for (let i = 0; i < orig.length; i += 4) {
      if (orig[i + 3] === 0) continue;
      const [r, g, b] = [orig[i], orig[i + 1], orig[i + 2]], [h, s, l] = hsl(r, g, b);
      if (keep && h >= 5 && h <= 45 && s >= 0.18 && s <= 0.8 && l >= 0.3 && l <= 0.88) continue;   // skin
      if (R.keepWhite && s < 0.2 && l > 0.62) continue;                                                // snow (Snowman's body)
      let c;
      if (R.op === 'hue') c = rgb((h + (R.deg || 0) + 360) % 360, Math.min(1, s * (R.sat ?? 1)), Math.max(0, Math.min(1, l + (R.light || 0))));
      else if (R.op === 'mono') { const v = Math.max(0, Math.min(1, (l - 0.5) * (R.contrast || 1.2) + 0.5)); c = [v * 255, v * 255, v * 255].map(Math.round); }
      else if (R.op === 'duo') c = mix(hx(R.a), hx(R.b), l);
      else if (R.op === 'tri') c = l < 0.5 ? mix(hx(R.a), hx(R.b), l * 2) : mix(hx(R.b), hx(R.c), (l - 0.5) * 2);
      else continue;
      if (Math.abs(c[0] - r) + Math.abs(c[1] - g) + Math.abs(c[2] - b) < 6) continue;
      over[i] = c[0]; over[i + 1] = c[1]; over[i + 2] = c[2]; over[i + 3] = 255;
    }
  }
  $('#loadSkin').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { await applySkin(JSON.parse(await f.text())); } catch (err) { say(err.message); } };
  $('#gallery').onclick = async () => {
    try {
      const idx = await (await fetch('skins/index.json', { cache: 'no-store' })).json();
      const box = document.createElement('div'); box.className = 'gal'; let pick = null;
      idx.forEach((k) => { const r = RIDERS.find((x) => x.id === k.rider), s = r && r.slots.find((x) => x.id === k.slot);
        const b = document.createElement('button'); b.innerHTML = '<b></b><span></span>'; b.firstChild.textContent = ((I18N.lang === 'en' && k.name_en) || k.name) + (k.author ? t('by', k.author) : '');
        b.lastChild.textContent = t('replacesLbl') + ' : ' + (s ? r.name + ' — ' + slotLabel(s) : (I18N.lang === 'en' && k.replaces_en) || k.replaces); b.onclick = () => { pick = k; $('#dlgActs').firstChild.click(); }; box.appendChild(b); });
      await dialog(t('galleryTitle'), box, [[t('close'), null]]);
      if (!pick) return;
      await applySkin(await (await fetch('skins/' + pick.file)).json());
    } catch (e) { say(t('galleryNA', e.message)); }
  };

  // ---------- 3D view (three.js)
  let renderer, scene, camera, mesh, glTex, glCanvasCtx, yaw = 0.5, pitch = 0.15, dist = 4200, spinOn = false;
  function initGL() {
    if (renderer) return;
    const cv = $('#gl'); renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); renderer.setPixelRatio(devicePixelRatio);
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x1d2633);
    camera = new THREE.PerspectiveCamera(35, 1, 10, 20000);
    const gc = document.createElement('canvas'); gc.width = TW; gc.height = TH; glCanvasCtx = gc.getContext('2d');
    glTex = new THREE.CanvasTexture(gc); glTex.magFilter = THREE.NearestFilter; glTex.minFilter = THREE.NearestFilter; glTex.flipY = false;
    const g = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshBasicMaterial({ color: 0xdfe8f2 })); g.rotation.x = -Math.PI / 2; g.position.y = -1000; scene.add(g);
    let drag = null, painting = false; const ray = new THREE.Raycaster();
    const pick = (e) => { if (S.view === 'menu') return null; const r = cv.getBoundingClientRect(); ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
      const h = mesh && ray.intersectObject(mesh)[0]; if (!h || !h.uv) return null; return [Math.min(TW - 1, Math.floor(h.uv.x * TW)), Math.min(TH - 1, Math.floor(h.uv.y * TH))]; };
    cv.oncontextmenu = (e) => e.preventDefault();
    cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId);
      if (e.button === 0 && $('#paint3d').checked) { const t = pick(e); if (t) { painting = true; S.paintUV(t[0], t[1], true); return; } }
      drag = [e.clientX, e.clientY]; };
    cv.onpointermove = (e) => { if (painting) { const t = pick(e); if (t) S.paintUV(t[0], t[1], false); else S.endUV(); return; }
      if (!drag) return; yaw -= (e.clientX - drag[0]) * 0.01; pitch = Math.max(-0.6, Math.min(1.2, pitch + (e.clientY - drag[1]) * 0.01)); drag = [e.clientX, e.clientY]; };
    cv.onpointerup = () => { drag = null; painting = false; S.endUV(); };
    cv.onwheel = (e) => { e.preventDefault(); dist = Math.max(900, Math.min(6000, dist * (e.deltaY > 0 ? 1.1 : 0.9))); };
    $('#rotL').onclick = () => (yaw += Math.PI / 4); $('#rotR').onclick = () => (yaw -= Math.PI / 4);
    $('#rotF').onclick = () => (yaw = S.view === 'menu' && menuSlot(S.cur) ? 0 : -Math.PI / 2); $('#rotB').onclick = () => (yaw = S.view === 'menu' && menuSlot(S.cur) ? Math.PI : Math.PI / 2);
    $('#spin').onchange = (e) => (spinOn = e.target.checked);
    const loop = () => {
      const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.floor(w * devicePixelRatio)) { renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
      if (spinOn) yaw += 0.01;
      camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, 60 + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist); camera.lookAt(0, 60, 0);
      renderer.render(scene, camera); requestAnimationFrame(loop);
    };
    loop();
  }
  let extra = null;
  function setModel(m) {
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
    if (extra) { scene.remove(extra); extra.geometry.dispose(); extra = null; }
    const ms = S.view === 'menu' && menuSlot(S.cur);
    if (S.view === 'menu' && !ms) $('#title').textContent = S.cur.r.name + ' — ' + slotLabel(S.cur.s) + ' · ' + t('menuNA');
    if (ms) return setMenuModel(ms.r);
    const pos = [], uv = [], col = [];
    const push = (p, k, textured) => { const v = p.v[k]; pos.push(v[0], -v[1], v[2]); if (textured) uv.push((p.uv[k][0] + 0.5) / TW, (p.uv[k][1] + 0.5) / TH); else uv.push(0, 0); const c = textured ? 1 : 0.55; col.push(c, c, c); };
    const gpos = [];
    for (const p of m.prims) {
      const t = p.tex && (p.tp & 0xf) === 9;
      if (!t) { for (const k of (p.nv === 4 ? [0, 1, 2, 1, 3, 2] : [0, 1, 2])) gpos.push(p.v[k][0], -p.v[k][1], p.v[k][2]); continue; }
      for (const k of [0, 1, 2]) push(p, k, t);
      if (p.nv === 4) for (const k of [1, 3, 2]) push(p, k, t);
    }
    if (gpos.length) { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3)); extra = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ color: 0x5b6b80, side: THREE.DoubleSide })); scene.add(extra); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.MeshBasicMaterial({ map: glTex, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5, transparent: false });
    mesh = new THREE.Mesh(g, mat); scene.add(mesh);
    // Fit the model to the stage like the menu view does (height 1966, feet on the snow, centred): the riders'
    // race models are not all at the same size and height (Snowman sank below the ground disc).
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const a of [pos, gpos]) for (let i = 0; i < a.length; i += 3) {
      x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]); z0 = Math.min(z0, a[i + 2]); z1 = Math.max(z1, a[i + 2]);
    }
    if (y1 > y0) {
      const sc = 1966 / (y1 - y0);
      for (const o of [mesh, extra]) if (o) { o.scale.setScalar(sc); o.position.set(-(x0 + x1) / 2 * sc, -983 - y0 * sc, -(z0 + z1) / 2 * sc); }
    }
  }

  function setMenuModel(r) {
    const M = menuMap(r), pos = [], uv = [], col = [];
    let ylo = 1e9, yhi = -1e9; M.V.flat().forEach((v) => { ylo = Math.min(ylo, v[1]); yhi = Math.max(yhi, v[1]); });
    const sc = 1966 / (yhi - ylo);
    M.objs.forEach((o, k) => o.prims.forEach((pr) => {
      const tpx = (pr.tp & 0xf) * 64, tpy = ((pr.tp >> 4) & 1) * 256, x0 = M.R.x0;
      const push = (i) => { const v = M.V[k][pr.idx[i]]; if (!v) return; pos.push(v[0] * sc, -(v[1] - yhi) * sc - 983, v[2] * sc);
        uv.push(((tpx - x0) * 2 + pr.uv[i][0] + 0.5) / 128, (tpy + pr.uv[i][1] + 0.5) / 256); col.push(1, 1, 1); };
      for (const i of [0, 1, 2]) push(i); if (pr.idx.length === 4) for (const i of [1, 3, 2]) push(i);
    }));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: glTex, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5 })); scene.add(mesh);
  }
  S.view = 'race';
  const setView = (v) => { S.view = v; $('#vRace').classList.toggle('on', v === 'race'); $('#vMenu').classList.toggle('on', v === 'menu'); if (S.cur) { $('#title').textContent = S.cur.r.name + ' — ' + slotLabel(S.cur.s); setModel(S.cur.m); redraw(); } };
  $('#vRace').onclick = () => setView('race'); $('#vMenu').onclick = () => setView('menu');

  // ---------- build the modified game
  $('#btnBuild').onclick = () => {
    const mods = Object.values(S.slots).filter((x) => x.dirty);
    $('#buildInfo').innerHTML = t('buildInfo', mods.length, mods.map((x) => '• ' + x.r.name + ' — ' + slotLabel(x.s)).join('<br>'), S.disc.kind.toUpperCase(), S.disc.kind === 'bin');
    $('#buildLog').textContent = ''; $('#buildGo').disabled = false; $('#build').style.display = 'flex'; $('#withRemixRow').hidden = S.state !== 'original';
  };
  $('#buildClose').onclick = () => ($('#build').style.display = 'none');
  $('#buildGo').onclick = async () => {
    $('#buildGo').disabled = true; const L = (t) => ($('#buildLog').textContent += t + '\n');
    try {
      const d = S.disc, withRemix = S.state === 'original' && $('#withRemix').checked, code = Seed.encode(S.cfg);
      const sec = await configuredSectors(d, { mods: withRemix ? S.cfg.mods : null, slots: Object.values(S.slots).filter((y) => y.dirty) }, L);
      if (withRemix) { await d.markConfig(sec, code); L('✓ ' + code); }
      L(t('assembling'));
      const r = await d.build(sec, L);
      const blob = new Blob(r.parts.map((p) => (p instanceof Uint8Array ? p : S.file.slice(p.a, p.b))));
      const base = S.file.name.replace(/\.(chd|bin|img|iso)$/i, '');
      const name = d.kind === 'bin' ? S.file.name : base + (withRemix ? ' (Remix ' + code.slice(4) + ')' : '') + t('skinsSuffix') + '.chd';
      dl(blob, name); L(t('downloading', name, (blob.size / 1048576).toFixed(0)));
    } catch (e) { L(t('error', e.message)); console.error(e); }
  };

  // ---------- board designer
  const BD = (() => {
    // the card's board image is 128x64: rows 0-31 = top face, rows 32-63 = bottom face (nose on the left).
    // Each face has its own canvas, stretched to the board's proportions (PX = width of a texel in display units).
    const W = Board.W, H = Board.H, FH = 32, PX = (540 / 78) / (W / FH), FW = W * PX;
    const faces = [...document.querySelectorAll('#boards .face')].map((el) => { const cv = el.querySelector('canvas'); return { el, wrap: el.querySelector('.fwrap'), cv, cx: cv.getContext('2d'), k: +el.dataset.face }; });
    let region = 'eu', img = new Uint8ClampedArray(W * H * 4), card = null, cardName = 'carte.srm', tool = 'brush', hist = [], header = null, ready = false;
    let P = null; // image being placed: {face, im, ux, uy, s0, z, a, flip}  (ux, uy, scale in display units)
    const fillAll = (c) => { for (let i = 0; i < W * H; i++) img.set([...c, 255], i * 4); };
    fillAll([245, 245, 245]);
    function composite(f) { // the face as it will be written: its pixels, plus the image being placed
      const c = document.createElement('canvas'); c.width = W; c.height = FH; const x = c.getContext('2d');
      x.putImageData(new ImageData(img.slice(f.k * FH * W * 4, (f.k + 1) * FH * W * 4), W, FH), 0, 0);
      if (P && P.face === f.k) {
        const s = P.s0 * 2 ** P.z; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        x.save(); x.scale(1 / PX, 1); x.translate(P.ux, P.uy); x.rotate(P.a); x.scale(P.flip ? -s : s, s);
        x.drawImage(P.im, -P.im.width / 2, -P.im.height / 2); x.restore();
      }
      return c;
    }
    function draw() {
      for (const f of faces) { f.cx.clearRect(0, 0, W, FH); f.cx.drawImage(composite(f), 0, 0); f.wrap.classList.toggle('placing', !!P && P.face === f.k); }
    }
    function init() {   // called for every opened disc: the save name and header follow its version
      ready = true;
      S.disc.bootExe().then((p) => { region = p === '/SCUS_943.58' ? 'us' : 'eu'; return S.disc.readFile(p); }).then((exe) => { header = Board.header(exe); $('#bSave').disabled = !card; if (card) setCard(card, cardName); }).catch((e) => ($('#mcInfo').textContent = t('error', e.message)));
      draw();
    }
    function setCard(c, name) {
      card = c; cardName = name;
      const other = region === 'us' ? 'eu' : 'us'; let f = Board.readFile(c, Board.NAMES[region]), conv = false;
      if (!f) { f = Board.readFile(c, Board.NAMES[other]); conv = !!f; }   // board of the other version: converted on save
      if (f) { try { const d = Board.decode(f); img = d.rgba; $('#bStyle').value = d.style; $('#bType').value = d.type; $('#mcInfo').textContent = conv ? t('boardConv', name, t(other === 'us' ? 'verUS' : 'verEU'), t(region === 'us' ? 'verUS' : 'verEU')) : t('boardFound', name); } catch (e) { $('#mcInfo').textContent = t('boardBad', name); } }
      else $('#mcInfo').textContent = t('boardNone', name);
      $('#bSave').disabled = !header; draw();
    }
    $('#mcFile').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const c = new Uint8Array(await f.arrayBuffer()); if (!Board.cardOK(c)) return S.dialog('Cool Boarders 2 Remix', t('notCard'), [[t('ok'), true, true]]); setCard(c, f.name); };
    $('#mcNew').onclick = () => setCard(Board.newCard(), 'carte.srm');
    document.querySelectorAll('#btools .bt').forEach((b) => (b.onclick = () => { document.querySelectorAll('#btools .bt').forEach((x) => x.classList.remove('on')); b.classList.add('on'); tool = b.dataset.tool; }));
    const col = () => hex2($('#bColor').value);
    // ---- painting (brush / fill / picker), on either face
    function dot(x, y, f) { const s = +$('#bSize').value, h = Math.floor((s - 1) / 2), c = col(); for (let yy = y - h; yy < y - h + s; yy++) for (let xx = x - h; xx < x - h + s; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < FH) img.set([...c, 255], ((yy + f.k * FH) * W + xx) * 4); }
    let last = null;
    function line(x, y, f) { if (last) { const n = Math.max(Math.abs(x - last[0]), Math.abs(y - last[1])); for (let k = 1; k <= n; k++) dot(Math.round(last[0] + (x - last[0]) * k / n), Math.round(last[1] + (y - last[1]) * k / n), f); } else dot(x, y, f); last = [x, y]; }
    function fill(x, y, f) { const c = col(), o = f.k * FH * W, k = (i) => img[i * 4] * 65536 + img[i * 4 + 1] * 256 + img[i * 4 + 2], k0 = k(o + y * W + x), seen = new Uint8Array(W * FH), st = [y * W + x];
      while (st.length) { const i = st.pop(); if (seen[i]) continue; seen[i] = 1; if (k(o + i) !== k0) continue; img.set([...c, 255], (o + i) * 4); const X = i % W, Y = (i / W) | 0;
        if (X > 0) st.push(i - 1); if (X < W - 1) st.push(i + 1); if (Y > 0) st.push(i - W); if (Y < FH - 1) st.push(i + W); } }
    // ---- placing an imported image: drag = move, wheel or two fingers = zoom / rotate
    const ptrs = new Map(); let gest = null, painting = null;
    const texel = (e, f) => { const r = f.cv.getBoundingClientRect(); return [Math.max(0, Math.min(W - 1, Math.floor((e.clientX - r.left) / r.width * W))), Math.max(0, Math.min(FH - 1, Math.floor((e.clientY - r.top) / r.height * FH)))]; };
    const unit = (f) => { const r = f.cv.getBoundingClientRect(); return [FW / r.width, FH / r.height]; };
    function syncSliders() { $('#bZoom').value = Math.round(P.z * 100); $('#bRot').value = Math.round(P.a * 180 / Math.PI); }
    function startGesture() { const p = [...ptrs.values()]; gest = p.length === 2 ? { d: Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y), ang: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x), z: P.z, a: P.a } : null; }
    for (const f of faces) {
      f.cv.onpointerdown = (e) => {
        if (P) { if (P.face !== f.k) return; f.cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); startGesture(); return; }
        const [x, y] = texel(e, f);
        if (tool === 'pick') { const i = ((y + f.k * FH) * W + x) * 4; $('#bColor').value = '#' + [img[i], img[i + 1], img[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''); return; }
        hist.push(img.slice()); if (hist.length > 40) hist.shift();
        if (tool === 'fill') { fill(x, y, f); draw(); return; }
        painting = f; last = null; f.cv.setPointerCapture(e.pointerId); line(x, y, f); draw();
      };
      f.cv.onpointermove = (e) => {
        if (painting === f) { const [x, y] = texel(e, f); line(x, y, f); draw(); return; }
        if (!P || P.face !== f.k || !ptrs.has(e.pointerId)) return;
        const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (ptrs.size === 1) { const [ux, uy] = unit(f); P.ux += (e.clientX - prev.x) * ux; P.uy += (e.clientY - prev.y) * uy; }
        else if (gest) { const p = [...ptrs.values()]; const d = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y), ang = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
          P.z = Math.max(-3, Math.min(3, gest.z + Math.log2(d / gest.d))); P.a = gest.a + ang - gest.ang; syncSliders(); }
        draw();
      };
      f.cv.onpointerup = f.cv.onpointercancel = (e) => { painting = null; last = null; ptrs.delete(e.pointerId); if (P) startGesture(); };
      f.cv.onwheel = (e) => { if (!P || P.face !== f.k) return; e.preventDefault();
        if (e.shiftKey) P.a += (e.deltaY > 0 ? 5 : -5) * Math.PI / 180; else P.z = Math.max(-3, Math.min(3, P.z + (e.deltaY > 0 ? -0.08 : 0.08)));
        syncSliders(); draw(); };
      const input = f.el.querySelector('input[type=file]');
      input.onchange = (e) => { const file = e.target.files[0]; e.target.value = ''; importImage(file, f.k); };
      f.wrap.ondragover = (e) => { e.preventDefault(); f.wrap.classList.add('hov'); };
      f.wrap.ondragleave = () => f.wrap.classList.remove('hov');
      f.wrap.ondrop = (e) => { e.preventDefault(); f.wrap.classList.remove('hov'); importImage(e.dataTransfer.files[0], f.k); };
    }
    function fit(cover) { const m = cover ? Math.max : Math.min; P.s0 = m(FW / P.im.width, FH / P.im.height); P.z = 0; P.a = 0; P.ux = FW / 2; P.uy = FH / 2; syncSliders(); draw(); }
    async function importImage(file, k) {
      if (!file || !/^image\//.test(file.type)) return;
      const im = await loadImg(URL.createObjectURL(file));
      P = { face: k, im, ux: FW / 2, uy: FH / 2, s0: 1, z: 0, a: 0, flip: false }; fit(true);
      $('#bPlace').hidden = false; faces[k].el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function endPlace(keep) {
      if (!P) return;
      if (keep) { hist.push(img.slice()); if (hist.length > 40) hist.shift(); img.set(composite(faces[P.face]).getContext('2d').getImageData(0, 0, W, FH).data, P.face * FH * W * 4); }
      P = null; ptrs.clear(); gest = null; $('#bPlace').hidden = true; draw();
    }
    $('#bZoom').oninput = (e) => { if (P) { P.z = e.target.value / 100; draw(); } };
    $('#bRot').oninput = (e) => { if (P) { P.a = e.target.value * Math.PI / 180; draw(); } };
    $('#bCover').onclick = () => P && fit(true);
    $('#bContain').onclick = () => P && fit(false);
    $('#bFlip').onclick = () => { if (P) { P.flip = !P.flip; draw(); } };
    $('#bPlaceOk').onclick = () => endPlace(true);
    $('#bPlaceCancel').onclick = () => endPlace(false);
    document.addEventListener('keydown', (e) => { if (!P) return; if (e.key === 'Enter') endPlace(true); else if (e.key === 'Escape') endPlace(false); });
    $('#bUndo').onclick = () => { if (P) return endPlace(false); if (hist.length) { img = hist.pop(); draw(); } };
    $('#bClear').onclick = () => { endPlace(false); hist.push(img.slice()); fillAll(col()); draw(); };
    // ready-made examples, drawn on the spot (top = rows 0-31, bottom = rows 32-63, nose on the left)
    const EX = {
      xmas(x) {
        let g = x.createLinearGradient(0, 0, 0, 32); g.addColorStop(0, '#b3121f'); g.addColorStop(1, '#7a0a14'); x.fillStyle = g; x.fillRect(0, 0, W, 32);
        x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, 32); for (let i = 0; i <= W; i += 8) x.quadraticCurveTo(i + 4, 24 + (i % 16 ? 2 : -1), i + 8, 27); x.lineTo(W, 32); x.fill();
        for (const [cx2, cy, r] of [[14, 8, 3], [30, 18, 2], [100, 7, 2], [116, 16, 3], [88, 20, 1.5], [22, 22, 1.5]]) { x.strokeStyle = '#fff'; x.lineWidth = 1; for (let a = 0; a < 3; a++) { x.beginPath(); x.moveTo(cx2 - Math.cos(a) * r * 1.6, cy - Math.sin(a) * r * 1.6); x.lineTo(cx2 + Math.cos(a) * r * 1.6, cy + Math.sin(a) * r * 1.6); x.stroke(); } }
        x.fillStyle = '#1e7a3c'; x.beginPath(); x.moveTo(64, 2); x.lineTo(54, 14); x.lineTo(58, 14); x.lineTo(50, 24); x.lineTo(78, 24); x.lineTo(70, 14); x.lineTo(74, 14); x.closePath(); x.fill();
        x.fillStyle = '#6b3b1a'; x.fillRect(62, 24, 4, 3); x.fillStyle = '#ffd34d'; x.fillRect(63, 1, 2, 2);
        for (const [a, b, c] of [[60, 12, '#ffd34d'], [68, 18, '#fff'], [58, 20, '#ffd34d'], [70, 11, '#fff']]) { x.fillStyle = c; x.fillRect(a, b, 2, 2); }
        x.fillStyle = '#0f5a2b'; x.fillRect(0, 32, W, 32);
        for (let i = -32; i < W + 32; i += 10) { x.fillStyle = (i / 10) & 1 ? '#fff' : '#c8102e'; x.beginPath(); x.moveTo(i, 32); x.lineTo(i + 5, 32); x.lineTo(i - 3, 64); x.lineTo(i - 8, 64); x.fill(); }
        x.fillStyle = '#0f5a2b'; x.fillRect(16, 36, 96, 24);
        x.fillStyle = '#fff'; x.font = 'bold 13px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('HO HO HO', 64, 48);
      },
      flames(x) {
        x.fillStyle = '#111'; x.fillRect(0, 0, W, 64);
        for (const y0 of [0, 32]) { for (let k = 0; k < 3; k++) { x.fillStyle = ['#ff3b00', '#ff8a00', '#ffd400'][k]; x.beginPath(); x.moveTo(0, y0 + 4 + k * 3); for (let i = 0; i < 9; i++) { const xx = 6 + i * (70 - k * 12) / 9; x.quadraticCurveTo(xx + 6, y0 + (i & 1 ? 2 + k * 3 : 14), xx + 10, y0 + 16); } x.lineTo(0, y0 + 28 - k * 3); x.fill(); } }
      },
      peak(x) {
        let g = x.createLinearGradient(0, 0, 0, 32); g.addColorStop(0, '#0a1626'); g.addColorStop(1, '#2a5a8c'); x.fillStyle = g; x.fillRect(0, 0, W, 32);
        x.fillStyle = '#e8f4ff'; x.beginPath(); x.moveTo(20, 32); x.lineTo(52, 6); x.lineTo(64, 16); x.lineTo(80, 4); x.lineTo(112, 32); x.fill();
        x.fillStyle = '#9db8d4'; x.beginPath(); x.moveTo(52, 6); x.lineTo(58, 32); x.lineTo(44, 32); x.fill(); x.beginPath(); x.moveTo(80, 4); x.lineTo(86, 32); x.lineTo(72, 32); x.fill();
        x.fillStyle = '#ff7a1a'; x.fillRect(0, 32, W, 32); x.fillStyle = '#0a1626'; x.font = 'bold 15px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('CB2 REMIX', 64, 48);
      },
    };
    $('#bEx').onchange = (e) => { const k = e.target.value; e.target.value = ''; if (!EX[k]) return; endPlace(false); const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); EX[k](x); hist.push(img.slice()); img = new Uint8ClampedArray(x.getImageData(0, 0, W, H).data); draw(); };
    $('#bExport').onclick = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').putImageData(new ImageData(img, W, H), 0, 0); c.toBlob((b) => dl(b, 'planche.png')); };
    $('#bSave').onclick = () => {
      endPlace(true);
      try { const f = Board.encode(img, +$('#bStyle').value, +$('#bType').value, header); const c = Board.writeFile(card, Board.NAMES[region], f); setCard(c, cardName);
        dl(new Blob([c]), cardName); $('#mcInfo').textContent = t('boardWritten', cardName); }
      catch (e) { S.dialog('Cool Boarders 2 Remix', e.message, [[t('ok'), true, true]]); }
    };
    return { init, redraw: draw };
  })();

  // ---------- patch panel (Remix)
  // ---------- soundtrack of the USA version (the player's own CD): European BGM n -> USA track (menus identical,
  // the rest one track later from BGM 13: see docs/pal_vs_usa.md of cb2-decomp)
  const US_MUSIC = {}; for (let k = 2; k <= 20; k++) US_MUSIC[k] = k <= 12 ? k : k + 1;
  $('#usFile').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    $('#usInfo').textContent = t('usReading');
    try {
      const read = async (a, b) => new Uint8Array(await f.slice(a, b).arrayBuffer());
      const u = await Disc.open(read, f.size, f.name);
      if (u.kind !== 'chd' || !u.files['/SCUS_943.58'] || !u.files['/CDDA/BGMT.DA']) throw new Error(t('usNotUS'));
      if (S.disc && S.disc.kind !== 'chd') throw new Error(t('usNeedChd'));
      S.us = u; S.usFile = f; $('#usInfo').textContent = t('usOK', f.name);
    } catch (err) { S.us = null; $('#usInfo').textContent = t('error', err.message); }
    patchState();
  };
  function discState() {
    const p = $('#discstate'); if (!S.disc) return;
    p.className = 'pill ' + (S.state === 'other' ? 'warn' : 'ok');
    p.textContent = S.cfgOnDisc ? t('stRemixCfg', S.cfgOnDisc) : { original: t('stOriginal'), remix: t('stRemix'), 'original-us': t('stOriginalUS'), 'remix-us': t('stRemixUS') }[S.state] || t('stOther');
    $('.usmus').hidden = /us$/.test(S.state);
    const us = /us$/.test(S.state); $('#modList').hidden = us; $('.cfg').hidden = us; $('#usNote').hidden = !us; $('#usNote').textContent = t('patchNeedUS');
    $('#skinList').parentElement && ($('#skinList').hidden = us);
  }
  function patchState() {
    const isUS = S.state === 'original-us', wantUS = $('#usMus').checked && !isUS;
    $('#usPick').hidden = !wantUS;
    $('#patchGo').disabled = !S.disc || S.patching || !(S.state === 'original' || isUS) || (wantUS && !S.us);
    if (S.patching || S.patchedName) return;
    $('#patchStatus').textContent = !S.disc ? '' : S.cfgOnDisc ? t('patchAlreadyCfg', S.cfgOnDisc) : S.state === 'remix' || S.state === 'remix-us' ? t('patchAlready') : S.state === 'other' ? t('patchSource') : isUS ? '' : t('patchNeed');
  }
  // ---------- mods, configuration code, ready-to-wear outfits
  const MODS = Seed.IDS, PRESETS = { all: MODS, earn: MODS.filter((m) => m !== 'unlock' && m !== 'special'), none: [] };
  S.cfg = { mods: [...MODS], usMusic: false, skins: [] }; S.skinIdx = [];
  async function modsPkg() {
    if (!_P.mods) { const b = Uint8Array.from(atob(window.REMIX_MODS.pkg), (c) => c.charCodeAt(0));
      _P.mods = JSON.parse(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text()); }
    return _P.mods;
  }
  function renderMods() {
    const box = $('#modList'); box.innerHTML = '';
    for (const id of MODS) {
      const [name, desc] = t('mods')[id], l = document.createElement('label'); l.className = 'mod' + (S.cfg.mods.includes(id) ? ' on' : '');
      l.innerHTML = '<input type="checkbox" class="sw"><div><b></b><p></p></div><img alt="" loading="lazy" hidden>';
      const cb = l.firstChild; cb.checked = S.cfg.mods.includes(id); cb.onchange = () => { S.cfg.mods = MODS.filter((m) => m === id ? cb.checked : S.cfg.mods.includes(m)); cfgChanged(); };
      l.querySelector('b').textContent = name; l.querySelector('p').textContent = desc;
      const im = l.querySelector('img'); im.onload = () => (im.hidden = false); im.src = 'screens/mod_' + id + '.png'; im.alt = name;
      im.onclick = (e) => { e.preventDefault(); im.classList.toggle('big'); };
      box.appendChild(l);
    }
    const sk = $('#skinList'); sk.innerHTML = '';
    if (!S.skinIdx.length) { sk.innerHTML = '<span class="mut"></span>'; sk.firstChild.textContent = t('skinsNone'); }
    const en = I18N.lang === 'en', groups = {};
    S.skinIdx.forEach((k, i) => (groups[k.rider] = groups[k.rider] || []).push([k, i]));
    for (const [rid, items] of Object.entries(groups)) {
      const g = document.createElement('div'); g.className = 'skgrp'; const h = document.createElement('b'); h.textContent = (RIDERS.find((r) => r.id === rid) || { name: rid }).name; g.appendChild(h);
      for (const [k, i] of items) { const l = document.createElement('label'); l.className = S.cfg.skins.includes(i) ? 'on' : '';
        l.innerHTML = '<input type="checkbox" class="sw"><span><b></b><br><small></small></span>'; const cb = l.firstChild; cb.checked = S.cfg.skins.includes(i);
        cb.onchange = () => { S.cfg.skins = S.skinIdx.map((_, n) => n).filter((n) => n === i ? cb.checked : S.cfg.skins.includes(n)); cfgChanged(); };
        l.querySelector('b').textContent = ((en && k.name_en) || k.name) + (k.author ? t('by', k.author) : '');
        l.querySelector('small').textContent = t('replacesLbl') + ' : ' + ((en && k.replaces_en) || k.replaces); g.appendChild(l); }
      sk.appendChild(g);
    }
    $('#usMus').checked = S.cfg.usMusic; $('#musEU').checked = !S.cfg.usMusic;
    $('#cfgOut').textContent = Seed.encode(S.cfg); $('#cfgSum').textContent = t('summary', S.cfg.mods.length, MODS.length);
    document.querySelectorAll('.presets button').forEach((b) => b.classList.toggle('on', PRESETS[b.dataset.preset].join() === S.cfg.mods.join()));
  }
  function cfgChanged() { renderMods(); try { history.replaceState(null, '', '#' + Seed.encode(S.cfg)); localStorage.setItem('cb2cfg', Seed.encode(S.cfg)); } catch (e) {} patchState(); }
  function loadCode(code, quiet) { const c = Seed.decode(code); if (!c) { if (!quiet) $('#cfgMsg').textContent = t('cfgBad'); return false; }
    c.skins = c.skins.filter((i) => i < Math.max(S.skinIdx.length, 64)); S.cfg = c; cfgChanged(); if (!quiet) $('#cfgMsg').textContent = t('cfgLoaded', Seed.encode(c)); return true; }
  document.querySelectorAll('.presets button').forEach((b) => (b.onclick = () => { S.cfg.mods = [...PRESETS[b.dataset.preset]]; cfgChanged(); }));
  $('#cfgLoad').onclick = () => loadCode($('#cfgIn').value);
  $('#cfgIn').onkeydown = (e) => { if (e.key === 'Enter') loadCode($('#cfgIn').value); };
  const copy = async (x) => { try { await navigator.clipboard.writeText(x); $('#cfgMsg').textContent = t('cfgCopied'); } catch (e) { $('#cfgMsg').textContent = x; } };
  $('#cfgCopy').onclick = () => copy(Seed.encode(S.cfg));
  $('#cfgLink').onclick = () => copy(location.href.split('#')[0] + '#' + Seed.encode(S.cfg));
  $('#musEU').onchange = $('#usMus').onchange = () => { S.cfg.usMusic = $('#usMus').checked; cfgChanged(); };
  (async () => {
    try { S.skinIdx = await (await fetch('skins/index.json')).json(); } catch (e) { S.skinIdx = []; }
    let start = location.hash.slice(1); try { start = start || localStorage.getItem('cb2cfg') || ''; } catch (e) {}
    if (!start || !loadCode(start, true)) renderMods();
  })();
  // the game as configured: mods + outfits (+ the Workshop's own edits) -> sector map, ready for d.build / composeSoundtrack
  async function configuredSectors(d, { mods, skins, slots = [] }, L) {
    let sec = {}, loc = S.loc, chr0 = S.chr;
    const user = async (l) => (sec[l] ? (sec[l] instanceof Uint8Array ? sec[l] : sec[l].data) : d.user(l));
    const putFile = async (lba, bytes) => { for (let k = 0; k < Math.ceil(bytes.length / 2048); k++) { const u = (await user(lba + k)).slice(); u.set(bytes.subarray(k * 2048, Math.min(bytes.length, (k + 1) * 2048)));
      sec[lba + k] = sec[lba + k] && !(sec[lba + k] instanceof Uint8Array) ? { sub: sec[lba + k].sub, data: u } : u; } };
    const readF = async (p) => { const e = d.files[p], out = new Uint8Array(Math.ceil(e.size / 2048) * 2048); for (let k = 0; k < out.length / 2048; k++) out.set(await user(e.lba + k), k * 2048); return out.subarray(0, e.size); };
    if (mods) { L(t('patchApplying')); sec = await d.applyMods(await modsPkg(), mods, L); loc = remixLoc(await readF('/SCES_009.92')); if (S.chr) chr0 = await readF('/TITLE/CHR.DAT'); }
    for (const i of skins || []) { const k = S.skinIdx[i]; if (!k) continue; L(t('skinApplying', k.name)); await applySkin(await (await fetch('skins/' + k.file)).json()); slots.push(S.cur); }
    slots = [...new Set(slots)];
    for (const x of slots) {
      const nf = CB2.fromRGBA(x.f, x.m.pm, composite(x), (() => { const ch = new Uint8Array(TW * TH); for (let i = 0; i < TW * TH; i++) ch[i] = x.over[i * 4 + 3] ? 1 : 0; return ch; })());
      const bytes = CB2.writeFBD(nf); await putFile(d.files[x.s.file].lba, bytes); L('✓ ' + x.r.name + ' — ' + slotLabel(x.s));
      if (x.s.enemy && loc) { const e = loc[x.s.enemy]; const raw = new Uint8Array(Math.ceil(e.size / 2048) * 2048); for (let k = 0; k < raw.length / 2048; k++) raw.set(await user(e.lba + k), k * 2048);
        await putFile(e.lba, CB2.patchEnemy(raw.subarray(0, e.size), bytes)); L(t('compTex')); }
    }
    if (S.chr) {
      const chr = chr0.slice(); let touched = false; const dirty = slots.filter((y) => menuSlot(y));
      for (let r = 0; r < 4; r++) {
        const mine = dirty.filter((y) => menuSlot(y).r === r); if (!mine.length) continue;
        const js = [...new Set(mine.map((y) => menuSlot(y).j))], ps = [...new Set(mine.map((y) => menuSlot(y).p))];
        for (const j of js) { const tx = menuTextures(r, j, 0, mine.filter((y) => menuSlot(y).j === j)); MenuSkin.writeTIM(chr, S.menu[r].up[j], tx.up, Board.quant); }
        for (const p of ps) { const tx = menuTextures(r, 0, p, mine.filter((y) => menuSlot(y).p === p)); MenuSkin.writeTIM(chr, S.menu[r].lo[p], tx.lo, Board.quant); }
        touched = true;
      }
      if (touched) { await putFile(d.files['/TITLE/CHR.DAT'].lba, chr); L(t('menuTex')); }
    }
    return sec;
  }
  $('#patchGo').onclick = async () => {
    const st = (x) => ($('#patchStatus').textContent = x); S.patching = true; S.patchedName = null; patchState();
    try {
      st(t('patchApplying')); const d = S.disc;
      const isUS = S.state === 'original-us', withUS = !isUS && S.cfg.usMusic && S.us, code = Seed.encode(S.cfg);
      let mods;
      if (isUS) mods = await d.applyDelta(await remixPatch(true), (x) => st(t('patchApplying') + ' ' + x));
      else { mods = await configuredSectors(d, { mods: S.cfg.mods, skins: S.cfg.skins }, st); await d.markConfig(mods, code); }
      st(t('assembling'));
      const r = withUS ? await d.composeSoundtrack(S.us, mods, US_MUSIC, (x) => st(t('assembling') + ' ' + x)) : await d.build(mods, (x) => st(t('assembling') + ' ' + x));
      const blob = new Blob(r.parts.map((p) => (p instanceof Uint8Array ? p : (p.f ? S.usFile : S.file).slice(p.a, p.b))));
      const base = S.file.name.replace(/\.chd$/i, '').replace(/ \(Remix[^)]*\)$/, '');
      const name = d.kind === 'bin' ? S.file.name : base + (isUS ? ' (Remix US).chd' : ' (Remix ' + code.slice(4) + ').chd');
      dl(blob, name); S.patchedName = name; st(t('patchDone', name) + (isUS ? '' : '\n' + t('cfgCode') + ' : ' + code));
    } catch (e) { st(e.code === 'source' ? t('patchSource') : t('error', e.message)); console.error(e); }
    S.patching = false; $('#patchGo').disabled = false;
  };

  // ---------- falling snow in the hero (skipped with reduced motion)
  (() => {
    const cv = $('#snow'); if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const x = cv.getContext('2d'); let W = 0, H = 0, vis = true; const F = [];
    const size = () => { W = cv.width = cv.clientWidth; H = cv.height = cv.clientHeight; };
    size(); addEventListener('resize', size);
    for (let i = 0; i < 110; i++) F.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2.2, s: 0.15 + Math.random() * 0.5, w: Math.random() * 6 });
    new IntersectionObserver((e) => (vis = e[0].isIntersecting)).observe(cv);
    const step = (ts) => {
      if (vis) { x.clearRect(0, 0, W, H); x.fillStyle = 'rgba(244,251,255,.8)';
        for (const f of F) { f.y += f.s / H * 2.2; f.x += Math.sin(ts / 1400 + f.w) * 0.0002; if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
          x.globalAlpha = 0.35 + f.r / 4; x.beginPath(); x.arc(f.x * W, f.y * H, f.r, 0, 7); x.fill(); } }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  })();

  // ---------- language
  document.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = () => I18N.set(b.dataset.lang)));
  I18N.onChange(() => {
    renderMods(); discState(); patchState();
    if (!S.disc) return;
    document.querySelectorAll('.slot').forEach((d) => { const r = RIDERS.find((x) => x.slots.some((y) => y.id === d.dataset.id)); const sl = r.slots.find((y) => y.id === d.dataset.id); d.lastChild.textContent = slotLabel(sl); });
    if (S.cur) $('#title').textContent = S.cur.r.name + ' — ' + slotLabel(S.cur.s);
    BD.redraw();
  });
  I18N.apply();

  // ---------- tabs
  S.tab = 'patch';
  function showTab() {
    document.querySelectorAll('.tabs .tab').forEach((x) => { x.classList.toggle('on', x.dataset.tab === S.tab); x.setAttribute('aria-selected', x.dataset.tab === S.tab); });
    for (const id of ['patch', 'work', 'boards', 'music', 'prog']) $('#' + id).classList.toggle('show', (!!S.disc || id === 'prog') && (id === 'work' ? 'skins' : id) === S.tab);
    $('#needdisc').style.display = S.disc || S.tab === 'prog' ? 'none' : 'block';
    if (S.tab === 'skins' && S.cur) setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    patchState();
  }
  document.querySelectorAll('.tabs .tab').forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; showTab(); }));
  showTab();
})();
