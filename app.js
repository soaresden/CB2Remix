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
  let _P = null;
  async function remixPatch() { // CB2D delta, gzip + base64 in patches.js
    if (!_P) { const b = Uint8Array.from(atob(window.REMIX.delta), (c) => c.charCodeAt(0));
      _P = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()); }
    return _P;
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
      S.disc = d; S.file = f; S.slots = {}; S.models = {}; S.cur = null; S.hist = []; S.patchedName = null;
      log(t('discOK', d.kind.toUpperCase(), Object.keys(d.files).length));
      // Remix extras (competition textures of Gray / Snowman)
      S.state = 'other';
      try {
        const exe = await d.readFile('/SCES_009.92'); S.loc = remixLoc(exe);
        if (S.loc) S.state = 'remix';
        else { const P = await remixPatch(); if (exe.length === u32(P, 12) && d.crc32(exe) === u32(P, 8)) S.state = 'original'; }
      } catch (e) { S.loc = null; }
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
    const img = await loadImg(j.png); const c = document.createElement('canvas'); c.width = TW; c.height = TH; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    pushHist(); S.cur.over.set(x.getImageData(0, 0, TW, TH).data); changed();
  }
  $('#loadSkin').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { await applySkin(JSON.parse(await f.text())); } catch (err) { say(err.message); } };
  $('#gallery').onclick = async () => {
    try {
      const idx = await (await fetch('skins/index.json', { cache: 'no-store' })).json();
      const box = document.createElement('div'); box.className = 'gal'; let pick = null;
      idx.forEach((k) => { const r = RIDERS.find((x) => x.id === k.rider), s = r && r.slots.find((x) => x.id === k.slot);
        const b = document.createElement('button'); b.innerHTML = '<b></b><span></span>'; b.firstChild.textContent = k.name + (k.author ? t('by', k.author) : '');
        b.lastChild.textContent = t('replacesLbl') + ' : ' + (s ? r.name + ' — ' + slotLabel(s) : k.replaces); b.onclick = () => { pick = k; $('#dlgActs').firstChild.click(); }; box.appendChild(b); });
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
      const d = S.disc; let sec = {}, loc = S.loc, chr0 = S.chr;
      const user = async (l) => (sec[l] ? (sec[l] instanceof Uint8Array ? sec[l] : sec[l].data) : d.user(l));
      const putFile = async (lba, bytes) => { for (let k = 0; k < Math.ceil(bytes.length / 2048); k++) { const u = (await user(lba + k)).slice(); u.set(bytes.subarray(k * 2048, Math.min(bytes.length, (k + 1) * 2048)));
        sec[lba + k] = sec[lba + k] && !(sec[lba + k] instanceof Uint8Array) ? { sub: sec[lba + k].sub, data: u } : u; } };
      const readF = async (p) => { const e = d.files[p], out = new Uint8Array(Math.ceil(e.size / 2048) * 2048); for (let k = 0; k < out.length / 2048; k++) out.set(await user(e.lba + k), k * 2048); return out.subarray(0, e.size); };
      const withRemix = S.state === 'original' && $('#withRemix').checked;
      if (withRemix) { L(t('patchApplying')); sec = await d.applyDelta(await remixPatch()); loc = remixLoc(await readF('/SCES_009.92')); if (S.chr) chr0 = await readF('/TITLE/CHR.DAT'); L('✓ Remix v' + window.REMIX.version); }
      for (const x of Object.values(S.slots).filter((y) => y.dirty)) {
        const nf = CB2.fromRGBA(x.f, x.m.pm, composite(x), (() => { const ch = new Uint8Array(TW * TH); for (let i = 0; i < TW * TH; i++) ch[i] = x.over[i * 4 + 3] ? 1 : 0; return ch; })());
        const bytes = CB2.writeFBD(nf); await putFile(d.files[x.s.file].lba, bytes); L('✓ ' + x.r.name + ' — ' + slotLabel(x.s));
        if (x.s.enemy && loc) { const e = loc[x.s.enemy]; const raw = new Uint8Array(Math.ceil(e.size / 2048) * 2048); for (let k = 0; k < raw.length / 2048; k++) raw.set(await user(e.lba + k), k * 2048);
          await putFile(e.lba, CB2.patchEnemy(raw.subarray(0, e.size), bytes)); L(t('compTex')); }
      }
      if (S.chr) {
        const chr = chr0.slice(); let touched = false; const dirty = Object.values(S.slots).filter((y) => y.dirty && menuSlot(y));
        for (let r = 0; r < 4; r++) {
          const mine = dirty.filter((y) => menuSlot(y).r === r); if (!mine.length) continue;
          const js = [...new Set(mine.map((y) => menuSlot(y).j))], ps = [...new Set(mine.map((y) => menuSlot(y).p))];
          for (const j of js) { const tx = menuTextures(r, j, 0, mine.filter((y) => menuSlot(y).j === j)); MenuSkin.writeTIM(chr, S.menu[r].up[j], tx.up, Board.quant); }
          for (const p of ps) { const tx = menuTextures(r, 0, p, mine.filter((y) => menuSlot(y).p === p)); MenuSkin.writeTIM(chr, S.menu[r].lo[p], tx.lo, Board.quant); }
          touched = true;
        }
        if (touched) { await putFile(d.files['/TITLE/CHR.DAT'].lba, chr); L(t('menuTex')); }
      }
      L(t('assembling'));
      const r = await d.build(sec, L);
      const blob = new Blob(r.parts.map((p) => (p instanceof Uint8Array ? p : S.file.slice(p.a, p.b))));
      const base = S.file.name.replace(/\.(chd|bin|img|iso)$/i, '');
      const name = d.kind === 'bin' ? S.file.name : base + (withRemix ? ' (Remix)' : '') + t('skinsSuffix') + '.chd';
      dl(blob, name); L(t('downloading', name, (blob.size / 1048576).toFixed(0)));
    } catch (e) { L(t('error', e.message)); console.error(e); }
  };

  // ---------- board designer
  const BD = (() => {
    const W = Board.W, H = Board.H, cv = $('#bCanvas'), cx = cv.getContext('2d'), prev = $('#bPrev'), px = prev.getContext('2d');
    let img = new Uint8ClampedArray(W * H * 4), card = null, cardName = 'carte.srm', tool = 'brush', hist = [], header = null, ready = false;
    const fillAll = (c) => { for (let i = 0; i < W * H; i++) img.set([...c, 255], i * 4); };
    fillAll([245, 245, 245]);
    function draw() {
      cx.putImageData(new ImageData(img, W, H), 0, 0);
      // preview: both faces as boards (rounded nose / tail)
      const tc = document.createElement('canvas'); tc.width = W; tc.height = H; tc.getContext('2d').putImageData(new ImageData(img, W, H), 0, 0);
      px.clearRect(0, 0, prev.width, prev.height); px.imageSmoothingEnabled = false;
      for (const [k, y] of [[0, 14], [1, 108]]) {
        px.save(); const x0 = 10, w = 540, h = 78, r = 38;
        px.beginPath(); px.moveTo(x0 + r, y); px.lineTo(x0 + w - r, y); px.arc(x0 + w - r, y + h / 2, h / 2, -Math.PI / 2, Math.PI / 2); px.lineTo(x0 + r, y + h); px.arc(x0 + r, y + h / 2, h / 2, Math.PI / 2, Math.PI * 1.5); px.closePath(); px.clip();
        px.drawImage(tc, 0, k * 32, W, 32, x0, y, w, h); px.restore();
        px.strokeStyle = '#0008'; px.lineWidth = 2; px.stroke();
        px.fillStyle = '#8ea0b8'; px.font = '12px system-ui'; px.fillText(k ? t('bottom') : t('top'), 14, y - 3);
      }
    }
    function init() {
      if (ready) return; ready = true;
      S.disc.readFile('/SCES_009.92').then((exe) => { header = Board.header(exe); $('#bSave').disabled = !card; }).catch((e) => ($('#mcInfo').textContent = t('error', e.message)));
      draw();
    }
    function setCard(c, name) {
      card = c; cardName = name;
      const f = Board.readFile(c, Board.NAME);
      if (f) { try { const d = Board.decode(f); img = d.rgba; $('#bStyle').value = d.style; $('#bType').value = d.type; $('#mcInfo').textContent = t('boardFound', name); } catch (e) { $('#mcInfo').textContent = t('boardBad', name); } }
      else $('#mcInfo').textContent = t('boardNone', name);
      $('#bSave').disabled = !header; draw();
    }
    $('#mcFile').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const c = new Uint8Array(await f.arrayBuffer()); if (!Board.cardOK(c)) return S.dialog('Cool Boarders 2 Remix', t('notCard'), [[t('ok'), true, true]]); setCard(c, f.name); };
    $('#mcNew').onclick = () => setCard(Board.newCard(), 'carte.srm');
    document.querySelectorAll('#btools .bt').forEach((b) => (b.onclick = () => { document.querySelectorAll('#btools .bt').forEach((x) => x.classList.remove('on')); b.classList.add('on'); tool = b.dataset.tool; }));
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * W), Math.floor((e.clientY - r.top) / r.height * H)]; };
    const col = () => hex2($('#bColor').value);
    let down = false, last = null;
    function dot(x, y) { const s = +$('#bSize').value, h = Math.floor((s - 1) / 2), c = col(); for (let yy = y - h; yy < y - h + s; yy++) for (let xx = x - h; xx < x - h + s; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) img.set([...c, 255], (yy * W + xx) * 4); }
    function line(x, y) { if (last) { const n = Math.max(Math.abs(x - last[0]), Math.abs(y - last[1])); for (let k = 1; k <= n; k++) dot(Math.round(last[0] + (x - last[0]) * k / n), Math.round(last[1] + (y - last[1]) * k / n)); } else dot(x, y); last = [x, y]; }
    function fill(x, y) { const c = col(), i0 = y * W + x, k = (i) => img[i * 4] * 65536 + img[i * 4 + 1] * 256 + img[i * 4 + 2], k0 = k(i0), seen = new Uint8Array(W * H), st = [i0], face = y < 32 ? 0 : 1;
      while (st.length) { const i = st.pop(); if (seen[i]) continue; seen[i] = 1; if (k(i) !== k0) continue; img.set([...c, 255], i * 4); const X = i % W, Y = (i / W) | 0;
        if (X > 0) st.push(i - 1); if (X < W - 1) st.push(i + 1); if (Y > 0 && ((Y - 1) >> 5) === face) st.push(i - W); if (Y < H - 1 && ((Y + 1) >> 5) === face) st.push(i + W); } }
    cv.onpointerdown = (e) => { const [x, y] = pos(e); if (tool === 'pick') { const i = (y * W + x) * 4; $('#bColor').value = '#' + [img[i], img[i + 1], img[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''); return; }
      hist.push(img.slice()); if (hist.length > 40) hist.shift(); if (tool === 'fill') { fill(x, y); draw(); return; } down = true; last = null; cv.setPointerCapture(e.pointerId); line(x, y); draw(); };
    cv.onpointermove = (e) => { if (down) { const [x, y] = pos(e); line(x, y); draw(); } };
    cv.onpointerup = () => { down = false; last = null; };
    $('#bUndo').onclick = () => { if (hist.length) { img = hist.pop(); draw(); } };
    $('#bClear').onclick = () => { hist.push(img.slice()); fillAll(col()); draw(); };
    // image import (JPG / PNG / WebP): whole board, top or bottom; button or drag-and-drop
    function place(im, face, fit) { // face: 'all' | 0 | 1
      const h = face === 'all' ? H : 32, c = document.createElement('canvas'); c.width = W; c.height = h; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, W, h); x.imageSmoothingQuality = 'high';
      const s = (fit === 'contain' ? Math.min : Math.max)(W / im.width, h / im.height);
      x.drawImage(im, (W - im.width * s) / 2, (h - im.height * s) / 2, im.width * s, im.height * s);
      hist.push(img.slice()); img.set(x.getImageData(0, 0, W, h).data, (face === 'all' ? 0 : face * 32) * W * 4); draw();
    }
    async function importImage(f, guess) {
      if (!f || !/^image\//.test(f.type)) return;
      const im = await loadImg(URL.createObjectURL(f));
      const box = document.createElement('div'); box.innerHTML = '<label class="chk"><input type="radio" name="fit" value="cover" checked> <span></span></label><label class="chk"><input type="radio" name="fit" value="contain"> <span></span></label>';
      box.querySelectorAll('span')[0].textContent = t('impFit'); box.querySelectorAll('span')[1].textContent = t('impContain');
      const fit = () => box.querySelector('input:checked').value;
      const opts = [[t('cancel'), null], [t('impBot'), () => [1, fit()], guess === 1], [t('impTop'), () => [0, fit()], guess === 0], [t('impAll'), () => ['all', fit()], guess === undefined]];
      const r = await S.dialog(t('impWhere'), box, opts); if (r) place(im, r[0], r[1]);
    }
    $('#bImpAll').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; importImage(f); };
    for (const el of [cv, prev]) {
      el.ondragover = (e) => { e.preventDefault(); cv.classList.add('hov'); };
      el.ondragleave = () => cv.classList.remove('hov');
      el.ondrop = (e) => { e.preventDefault(); cv.classList.remove('hov'); const f = e.dataTransfer.files[0]; const r = el.getBoundingClientRect();
        importImage(f, el === cv ? (e.clientY - r.top < r.height / 2 ? 0 : 1) : (e.clientY - r.top < r.height / 2 ? 0 : 1)); };
    }
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
    $('#bEx').onchange = (e) => { const k = e.target.value; e.target.value = ''; if (!EX[k]) return; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); EX[k](x); hist.push(img.slice()); img = new Uint8ClampedArray(x.getImageData(0, 0, W, H).data); draw(); };
    $('#bExport').onclick = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').putImageData(new ImageData(img, W, H), 0, 0); c.toBlob((b) => dl(b, 'planche.png')); };
    $('#bSave').onclick = () => {
      try { const f = Board.encode(img, +$('#bStyle').value, +$('#bType').value, header); const c = Board.writeFile(card, Board.NAME, f); setCard(c, cardName);
        dl(new Blob([c]), cardName); $('#mcInfo').textContent = t('boardWritten', cardName); }
      catch (e) { S.dialog('Cool Boarders 2 Remix', e.message, [[t('ok'), true, true]]); }
    };
    return { init, redraw: draw };
  })();

  // ---------- patch panel (Remix)
  function discState() {
    const p = $('#discstate'); if (!S.disc) return;
    p.className = 'pill ' + (S.state === 'other' ? 'warn' : 'ok');
    p.textContent = S.state === 'original' ? t('stOriginal') : S.state === 'remix' ? t('stRemix') : t('stOther');
  }
  function patchState() {
    $('#patchGo').disabled = !S.disc || S.state !== 'original' || S.patching;
    if (S.patching || S.patchedName) return;
    $('#patchStatus').textContent = !S.disc ? '' : S.state === 'remix' ? t('patchAlready') : S.state === 'other' ? t('patchSource') : t('patchNeed');
  }
  function renderFeat() {
    const box = $('#featList'); box.innerHTML = '';
    for (const [h, items] of t('feat')) { const g = document.createElement('div'); g.className = 'grp'; const hh = document.createElement('h3'); hh.textContent = h; g.appendChild(hh);
      const ul = document.createElement('ul'); for (const it of items) { const li = document.createElement('li'); li.textContent = it; ul.appendChild(li); } g.appendChild(ul); box.appendChild(g); }
  }
  $('#patchGo').onclick = async () => {
    const st = (x) => ($('#patchStatus').textContent = x); S.patching = true; S.patchedName = null; patchState();
    try {
      st(t('patchApplying')); const d = S.disc;
      const mods = await d.applyDelta(await remixPatch(), (x) => st(t('patchApplying') + ' ' + x));
      st(t('assembling')); const r = await d.build(mods, (x) => st(t('assembling') + ' ' + x));
      const blob = new Blob(r.parts.map((p) => (p instanceof Uint8Array ? p : S.file.slice(p.a, p.b))));
      const name = d.kind === 'bin' ? S.file.name : S.file.name.replace(/\.chd$/i, '') + ' (Remix).chd';
      dl(blob, name); S.patchedName = name; st(t('patchDone', name));
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
    renderFeat(); discState(); patchState();
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
    for (const id of ['patch', 'work', 'boards']) $('#' + id).classList.toggle('show', !!S.disc && (id === 'work' ? 'skins' : id) === S.tab);
    $('#needdisc').style.display = S.disc ? 'none' : 'block';
    if (S.tab === 'skins' && S.cur) setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    patchState();
  }
  document.querySelectorAll('.tabs .tab').forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; showTab(); }));
  showTab();
})();
