// "Musiques" tab: the game's soundtrack (CD audio tracks) read from the player's own disc, played in the page and
// saved as MP3 (lamejs, encoded in the browser) or WAV, one by one or all in a zip. Nothing is uploaded.
(function () {
  const $ = (s) => document.querySelector(s), t = I18N.t;
  // lamejs 1.2.1 (LGPL-3.0), loaded only when an MP3 is asked for; the hash pins the exact npm file
  const LAME = { src: 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js', integrity: 'sha384-xuasJXVcyv3hZq0eYpelEkBC8l4yufatZXDsKuyCU2rqfhDCb+ftuE/mSfZAteiK' };
  let disc = null, discName = '', tracks = [], busy = false, lame = null, url = null, playing = -1;
  const M = { disc: null };
  const fmt = () => $('#mFmt').value;                       // 'mp3-320' | 'mp3-192' | 'mp3-128' | 'wav'
  const dur = (frames) => { const s = Math.round(frames / 75); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const label = (tr) => (tr.name ? tr.name : t('mTrack', tr.n));
  const fileBase = (tr) => String(tr.n).padStart(2, '0') + ' - Cool Boarders 2 - ' + label(tr);
  const status = (s) => ($('#mStatus').textContent = s);
  const yieldUI = () => new Promise((r) => setTimeout(r, 0));

  function loadLame() {
    if (window.lamejs) return Promise.resolve(window.lamejs);
    if (!lame) lame = new Promise((ok, ko) => { const s = document.createElement('script'); s.src = LAME.src; s.integrity = LAME.integrity; s.crossOrigin = 'anonymous';
      s.onload = () => (window.lamejs ? ok(window.lamejs) : ko(new Error(t('mLameKO')))); s.onerror = () => { lame = null; ko(new Error(t('mLameKO'))); }; document.head.appendChild(s); });
    return lame;
  }
  function wav(pcm) {
    const b = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(b), w = (o, s) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, 44100, true); v.setUint32(28, 44100 * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, pcm.length * 2, true);
    new Int16Array(b, 44).set(pcm); return new Uint8Array(b);
  }
  function id3(tr) { // ID3v2.3: title, album, track number
    const enc = new TextEncoder(), fr = (id, s) => { const d = new Uint8Array([3, ...enc.encode(s)]), h = new Uint8Array(10); h.set(enc.encode(id)); new DataView(h.buffer).setUint32(4, d.length); return [h, d]; };
    const parts = [...fr('TIT2', label(tr)), ...fr('TALB', 'Cool Boarders 2'), ...fr('TRCK', String(tr.n)), ...fr('TSSE', 'CB2 Remix (lamejs)')];
    const size = parts.reduce((s, p) => s + p.length, 0), h = new Uint8Array(10); h.set(enc.encode('ID3')); h[3] = 3;
    for (let i = 0; i < 4; i++) h[6 + i] = (size >> (21 - 7 * i)) & 0x7f;
    return [h, ...parts];
  }
  async function mp3(pcm, kbps, tr, onP) {
    const L = await loadLame(), enc = new L.Mp3Encoder(2, 44100, kbps), n = pcm.length / 2, l = new Int16Array(n), r = new Int16Array(n), out = id3(tr);
    for (let i = 0; i < n; i++) { l[i] = pcm[2 * i]; r[i] = pcm[2 * i + 1]; }
    const step = 1152 * 40;
    for (let i = 0; i < n; i += step) { for (let j = i; j < Math.min(n, i + step); j += 1152) { const b = enc.encodeBuffer(l.subarray(j, j + 1152), r.subarray(j, j + 1152)); if (b.length) out.push(new Uint8Array(b.buffer, b.byteOffset, b.length)); }
      onP(i / n); await yieldUI(); }
    const f = enc.flush(); if (f.length) out.push(new Uint8Array(f.buffer, f.byteOffset, f.length));
    return new Blob(out, { type: 'audio/mpeg' });
  }
  async function render(tr, row, mode) { // -> {blob, name}
    const prog = (k, x) => { row.querySelector('.mp').textContent = k + ' ' + Math.round(x * 100) + ' %'; };
    let blob, ext;
    try {
      const pcm = await disc.readAudio(tr, (x) => prog(t('mReading'), x));
      if (mode === 'wav') { blob = new Blob([wav(pcm)], { type: 'audio/wav' }); ext = '.wav'; }
      else { blob = await mp3(pcm, +mode.split('-')[1], tr, (x) => prog(t('mEncoding'), x)); ext = '.mp3'; }
    } catch (e) { row.querySelector('.mp').textContent = ''; throw e; }
    row.querySelector('.mp').textContent = (blob.size / 1048576).toFixed(1) + ' Mo';
    return { blob, name: fileBase(tr) + ext };
  }
  function save(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); }
  async function guard(f) { if (busy) return; busy = true; document.querySelectorAll('#music button').forEach((b) => (b.disabled = true));
    try { await f(); } catch (e) { status(t('error', e.message)); console.error(e); }
    busy = false; document.querySelectorAll('#music button').forEach((b) => (b.disabled = false)); }
  // stored zip (MP3 / WAV are already compressed or not worth compressing)
  function zip(files) {
    const CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; }
    const crc = (u) => { let c = -1; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
    const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), sum = crc(f.data), sz = f.data.length, l = new DataView(new ArrayBuffer(30)), c = new DataView(new ArrayBuffer(46));
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint16(12, 0x21, true); l.setUint32(14, sum, true); l.setUint32(18, sz, true); l.setUint32(22, sz, true); l.setUint16(26, name.length, true);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x21, true); c.setUint32(16, sum, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      parts.push(new Uint8Array(l.buffer), name, f.data); cd.push(new Uint8Array(c.buffer), name); off += 30 + name.length + sz;
    }
    const cs = cd.reduce((s, p) => s + p.length, 0), z = new DataView(new ArrayBuffer(22));
    z.setUint32(0, 0x06054b50, true); z.setUint16(8, files.length, true); z.setUint16(10, files.length, true); z.setUint32(12, cs, true); z.setUint32(16, off, true);
    return new Blob([...parts, ...cd, new Uint8Array(z.buffer)], { type: 'application/zip' });
  }
  function list() {
    const box = $('#mList'); box.innerHTML = '';
    if (!tracks.length) { box.textContent = t('mNone'); return; }
    tracks.forEach((tr, i) => {
      const row = document.createElement('div'); row.className = 'mrow';
      row.innerHTML = '<span class="mn"></span><b></b><span class="md"></span><span class="mp"></span><button class="mplay"></button><button class="msave"></button>';
      row.querySelector('.mn').textContent = String(tr.n).padStart(2, '0'); row.querySelector('b').textContent = label(tr); row.querySelector('.md').textContent = dur(tr.frames);
      const pb = row.querySelector('.mplay'); pb.textContent = t('mPlay'); pb.setAttribute('aria-label', t('mPlay') + ' ' + label(tr));
      pb.onclick = () => (playing === i ? stop() : guard(async () => {
        const pcm = await disc.readAudio(tr, (x) => (row.querySelector('.mp').textContent = t('mReading') + ' ' + Math.round(x * 100) + ' %'));
        row.querySelector('.mp').textContent = ''; if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(new Blob([wav(pcm)], { type: 'audio/wav' }));
        const a = $('#mAudio'); a.src = url; a.hidden = false; a.play().catch(() => {}); playing = i; markPlaying(); status(t('mNow', label(tr)));
      }));
      const sb = row.querySelector('.msave'); sb.textContent = t('mSave'); sb.onclick = () => guard(async () => { const r = await render(tr, row, fmt()); save(r.blob, r.name); status(t('mSaved', r.name)); });
      box.appendChild(row);
    });
    markPlaying();
  }
  function markPlaying() { document.querySelectorAll('#mList .mrow').forEach((r, i) => { r.classList.toggle('on', i === playing); r.querySelector('.mplay').textContent = i === playing ? t('mStop') : t('mPlay'); }); }
  function stop() { const a = $('#mAudio'); a.pause(); playing = -1; markPlaying(); status(''); }
  $('#mAudio').onended = () => { playing = -1; markPlaying(); };
  $('#mAll').onclick = () => guard(async () => {
    const files = [], mode = fmt(), rows = document.querySelectorAll('#mList .mrow');
    for (let i = 0; i < tracks.length; i++) { status(t('mAllProgress', i + 1, tracks.length)); const r = await render(tracks[i], rows[i], mode); files.push({ name: r.name, data: new Uint8Array(await r.blob.arrayBuffer()) }); }
    const name = 'Cool Boarders 2 - ' + t('mAlbum') + (mode === 'wav' ? ' (WAV)' : ' (MP3)') + '.zip'; save(zip(files), name); status(t('mSaved', name));
  });
  M.setDisc = (d, name) => { disc = d; discName = name; stop(); try { tracks = d.audioTracks ? d.audioTracks() : []; } catch (e) { tracks = []; } list(); status(tracks.length ? t('mFound', tracks.length) : ''); };
  I18N.onChange(() => { if (disc) list(); });
  window.CB2Music = M;
})();
