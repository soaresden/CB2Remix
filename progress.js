// CB2 Remix – Progression: reads the game's save (memory card) and shows the 100 % checklist.
// Save "B?SCES-00992SAVE0" / "B?SCUS-94358SAVE0": one 8 KB block; at 0x21C the size word (0x998), then a copy of the
// game's progress variables 0x80057434..0x8005744D (PAL addresses), see cb2-decomp docs/progression.md.
(() => {
  const $ = (s) => document.querySelector(s);
  const COURSES = ['White Resort', 'Sunset Downhill', 'Bear in the Forest', 'Railroad Trip', 'Take It Easy', 'Pipeline Canyon', 'Freezing Point', 'Winding River', 'Snow Ruins', 'Dive into the Cave'];
  const L = {
    fr: {
      title: 'Ta progression', lead: 'Ouvre ta carte mémoire : la page lit la sauvegarde de Cool Boarders 2 et coche ce que tu as déjà gagné. Rien n’est envoyé.',
      pick: 'Ouvrir une carte mémoire', where: 'Batocera : /userdata/saves/psx/<nom du jeu>.srm (pcsx_rearmed) ou .mcd (DuckStation). Formats lus : .srm, .mcr, .mcd, .mc, .gme, .vmp, .mcs, .psv.',
      none: 'Pas de sauvegarde Cool Boarders 2 sur cette carte.', bad: 'Sauvegarde trouvée mais illisible.', found: (n, r) => 'Sauvegarde ' + n + ' (' + r + ')',
      riders: 'Riders cachés', modes: 'Modes', boards: 'Planches SPECIAL', trophies: 'Trophées du Free Style', time: 'Temps', trick: 'Figures', total: 'Total',
      boss: ['Boss', '1re place en Compétition Mirror.'], gray: ['Gray', 'Half-pipe : 37,6 points ou plus — ou finir toutes les figures du Big Air Master.'],
      snow: ['Snowman', '1re place en Compétition Hard — ou les 30 trophées du Free Style.'],
      mirror: ['Mode Mirror', 'Finir la Compétition sur le podium (top 3).'], hard: ['Mode Hard', 'Finir la Compétition Mirror sur le podium.'],
      hm: ['Hard + Mirror (Remix)', 'Mode ajouté par le Remix : L1 + R1 + ✕ sur Competition. Disponible dès que le Hard est débloqué (pas compté dans le 100 % du jeu d’origine).'],
      sp: (i) => ['Planche SPECIAL ' + (i + 1), 'Records du Free Style (trophées des pistes).'],
      courses: (n) => 'Pistes ouvertes au Free Style : ' + n + ' / 10',
      trophyHelp: 'Un trophée = battre le record officiel de la piste (affiché en bas à gauche) en Free Style.',
      outfits: 'Les tenues cachées de Cindy et Irin ne se gagnent pas : dans le jeu d’origine c’est un code (avec le mod « Tenues cachées », elles sont toujours là).',
      remixNote: 'Avec le mod « Tout débloqué », une nouvelle sauvegarde a déjà riders, modes et planches : seuls les trophées restent à gagner.',
    },
    en: {
      title: 'Your progress', lead: 'Open your memory card: the page reads the Cool Boarders 2 save and ticks what you have already earned. Nothing is uploaded.',
      pick: 'Open a memory card', where: 'Batocera: /userdata/saves/psx/<game name>.srm (pcsx_rearmed) or .mcd (DuckStation). Formats: .srm, .mcr, .mcd, .mc, .gme, .vmp, .mcs, .psv.',
      none: 'No Cool Boarders 2 save on this card.', bad: 'Save found but unreadable.', found: (n, r) => 'Save ' + n + ' (' + r + ')',
      riders: 'Hidden riders', modes: 'Modes', boards: 'SPECIAL boards', trophies: 'Free Style trophies', time: 'Time', trick: 'Tricks', total: 'Total',
      boss: ['Boss', '1st place in Mirror Competition.'], gray: ['Gray', 'Half-pipe: 37.6 points or more — or finish every Big Air Master trick.'],
      snow: ['Snowman', '1st place in Hard Competition — or all 30 Free Style trophies.'],
      mirror: ['Mirror mode', 'Finish Competition on the podium (top 3).'], hard: ['Hard mode', 'Finish Mirror Competition on the podium.'],
      hm: ['Hard + Mirror (Remix)', 'Mode added by the Remix: L1 + R1 + ✕ on Competition. Available once Hard is unlocked (not counted in the original game’s 100%).'],
      sp: (i) => ['SPECIAL board ' + (i + 1), 'Free Style records (course trophies).'],
      courses: (n) => 'Courses open in Free Style: ' + n + ' / 10',
      trophyHelp: 'A trophy = beat the course’s official record (shown bottom left) in Free Style.',
      outfits: 'Cindy and Irin’s hidden outfits are not earned: in the original game they come from a code (with the “hidden outfits” mod they are always there).',
      remixNote: 'With the “Everything unlocked” mod, a new save already has riders, modes and boards: only the trophies are left to earn.',
    },
  };
  const tr = (k, ...a) => { const v = (L[I18N.lang] || L.fr)[k]; return typeof v === 'function' ? v(...a) : v; };
  // ---- memory card formats -> {name, block (8 KB)}
  function findSave(u8) {
    const re = /^B[AEI]SC[EU]S-(00992|94358)SAVE0/;
    const name = (o) => String.fromCharCode(...u8.subarray(o, o + 20)).replace(/\0.*$/s, '');
    const raw = (base) => { // 128 KB card at base
      if (u8.length < base + 0x20000 || u8[base] !== 0x4d || u8[base + 1] !== 0x43) return null;
      for (let k = 1; k < 16; k++) { const f = base + 0x80 * k; if ((u8[f] & 0xf0) === 0x50 && re.test(name(f + 10))) return { name: name(f + 10), block: u8.subarray(base + 0x2000 * k, base + 0x2000 * (k + 1)) }; }
      return { none: true };
    };
    for (const b of [0, 0x80, 0xf40, 0x40]) { const r = raw(b); if (r) return r; }               // raw / .vmp / .gme / misc headers
    if (re.test(name(10)) && u8[0x80] === 0x53) return { name: name(10), block: u8.subarray(0x80, 0x2080) };   // .mcs
    if (String.fromCharCode(...u8.subarray(1, 4)) === 'VSP' && re.test(name(0x64))) return { name: name(0x64), block: u8.subarray(0x84, 0x2084) }; // .psv
    return null;
  }
  function decode(block) {
    const dv = new DataView(block.buffer, block.byteOffset, block.length);
    if (block[0] !== 0x53 || block[1] !== 0x43 || dv.getUint32(0x21c, true) !== 0x998) return null;
    const v = (a) => dv.getUint16(0x21c + 4 + a - 0x80057434, true);
    return { riders: v(0x80057440), courses: v(0x8005743e), special: v(0x80057442), mirror: v(0x80057444), hard: v(0x80057446), time: v(0x80057448), trick: v(0x8005744a), total: v(0x8005744c) };
  }
  function render(st, label) {
    const box = $('#progOut'); box.innerHTML = '';
    if (!st) return;
    const items = [];
    const sec = (title) => { const s = document.createElement('div'); s.className = 'pgrp'; const h = document.createElement('h3'); h.textContent = title; s.appendChild(h); box.appendChild(s); return s; };
    const row = (parent, [name, how], ok, extra) => { if (!extra) items.push(ok); const r = document.createElement('div'); r.className = 'pitem' + (ok ? ' ok' : '');
      r.innerHTML = '<span class="pchk" aria-hidden="true"></span><div><b></b><p></p></div>'; if (extra) r.classList.add('extra'); r.querySelector('b').textContent = name; r.querySelector('p').textContent = how;
      r.setAttribute('aria-label', name + (ok ? ' ✓' : '')); parent.appendChild(r); };
    const head = document.createElement('div'); head.className = 'phead'; box.appendChild(head);
    let s = sec(tr('riders')); row(s, tr('boss'), st.riders & 0x10); row(s, tr('gray'), st.riders & 0x20); row(s, tr('snow'), st.riders & 0x40);
    s = sec(tr('modes')); row(s, tr('mirror'), st.mirror); row(s, tr('hard'), st.hard); row(s, tr('hm'), st.hard, true);
    const c = document.createElement('p'); c.className = 'mut'; c.textContent = tr('courses', Math.min(10, st.courses)); s.appendChild(c);
    s = sec(tr('boards')); for (let i = 0; i < 3; i++) row(s, tr('sp', i), (st.special >> i) & 1);
    s = sec(tr('trophies'));
    const tb = document.createElement('table'); tb.className = 'ptab';
    tb.innerHTML = '<thead><tr><th></th><th></th><th></th><th></th></tr></thead><tbody></tbody>';
    ['', tr('time'), tr('trick'), tr('total')].forEach((x, i) => (tb.tHead.rows[0].cells[i].textContent = x));
    COURSES.forEach((n, i) => { const r = tb.tBodies[0].insertRow(); r.insertCell().textContent = n;
      for (const k of ['time', 'trick', 'total']) { const ok = (st[k] >> i) & 1; items.push(ok); const td = r.insertCell(); td.textContent = ok ? '🏆' : '·'; td.className = ok ? 'ok' : ''; } });
    s.appendChild(tb); const hp = document.createElement('p'); hp.className = 'mut'; hp.textContent = tr('trophyHelp'); s.appendChild(hp);
    const n = items.filter(Boolean).length, pct = Math.floor(100 * n / items.length);
    head.innerHTML = '<div class="pbig"></div><div class="pbar"><i></i></div><p class="mut"></p>';
    head.firstChild.textContent = pct + ' %'; head.querySelector('i').style.width = pct + '%'; head.lastChild.textContent = label + ' — ' + n + ' / ' + items.length;
    const o = document.createElement('p'); o.className = 'mut'; o.textContent = tr('outfits') + ' ' + tr('remixNote'); box.appendChild(o);
  }
  let last = null;
  const show = () => { $('#progTitle').textContent = tr('title'); $('#progLead').textContent = tr('lead'); $('#progPickTxt').textContent = tr('pick'); $('#progWhere').textContent = tr('where');
    if (last && last.st) render(last.st, tr('found', last.name, last.region)); else if (last) $('#progOut').textContent = tr(last.err); };
  $('#progFile').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const u8 = new Uint8Array(await f.arrayBuffer()), r = findSave(u8);
    if (!r || r.none) last = { err: 'none' };
    else { const st = decode(r.block); last = st ? { st, name: f.name, region: /SCUS/.test(r.name) ? 'USA' : 'Europe' } : { err: 'bad' }; }
    show();
  };
  I18N.onChange(show); show();
  window.CB2Progress = { findSave, decode };
})();
