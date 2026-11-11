// FR / EN interface strings. I18N.t(key, ...args) ; I18N.set('fr'|'en') re-applies [data-i18n], [data-i18n-html], [data-i18n-title]
(function (root) {
  const D = {
    fr: {
      build: 'Créer le jeu modifié…',
      openTitle: 'Ouvre ton jeu',
      openText: 'Choisis ton <b>.chd</b> ou ton <b>.bin</b> de Cool Boarders 2 (PAL, patché Remix ou non). Tout se passe dans ton navigateur : rien n’est envoyé nulle part.',
      drop: 'Glisse le fichier ici ou <u>clique pour le choisir</u>',
      front: 'Face', back: 'Dos', paint3d: 'peindre sur le modèle', spin: 'rotation auto', viewHelp: 'clic droit / glisser à côté = tourner · molette = zoom',
      tBrush: '✎ Pinceau', tTint: '◐ Teinte', tTintTip: 'Change la couleur en gardant les plis et les ombres', tFill: '▧ Remplir', tFillTip: 'Remplit une zone de couleur proche',
      tPick: '⦿ Pipette', tErase: '⌫ Gomme', tEraseTip: 'Remet la texture d’origine', size: 'Taille', tol: 'Tolérance', shade: 'ombres', shadeTip: 'Le remplissage garde les ombres',
      undo: 'Annuler', reset: 'Tout effacer', tpl: 'Exporter le gabarit PNG', imp: 'Importer PNG', saveSkin: 'Enregistrer le skin…', loadSkin: 'Charger un skin', gallery: 'Galerie',
      mcTitle: 'Carte mémoire', mcText: 'Ta sauvegarde Batocera : <code>/userdata/saves/psx/</code> (fichier <b>.srm</b> du jeu, ou <b>_1.mcd</b> selon l’émulateur). Ferme le jeu avant de remplacer le fichier.',
      mcOpen: 'Ouvrir ma carte', mcNew: 'Carte vierge', board: 'Planche',
      boardHelp: 'Le style et le type règlent le comportement de la planche en course (comme dans l’éditeur du jeu). 32 couleurs maximum, comme dans le jeu.',
      bSave: 'Écrire dans la carte et télécharger', bClear: 'Tout remplir', bImpTop: 'Image sur le dessus', bImpBot: 'Image sous la planche', bExport: 'Exporter PNG',
      bTopLbl: 'DESSUS (spatule à gauche)', bHalfLbl: '↑ moitié haute = dessus · moitié basse = dessous', preview: 'Aperçu', top: 'DESSUS', bottom: 'DESSOUS',
      buildTitle: 'Créer le jeu modifié', close: 'Fermer', create: 'Créer',
      combo: (j, p) => `Veste ${j} · Pantalon ${p}`, hidden: (k, j) => `Tenue cachée ${k} (veste ${j})`, color: (k) => `Couleur ${k}`,
      opening: (n, mb) => `Ouverture de ${n} (${mb} Mo)…`, notCB2: 'ce disque n’est pas Cool Boarders 2 (PAL)', discOK: (k, n) => `${k} OK, ${n} fichiers.`, error: (m) => 'Erreur : ' + m,
      confirmReset: 'Effacer toutes les retouches de cette tenue ?', noEdit: 'Cette tenue n’a pas de retouche.', skinName: 'Nom du skin ?', skinDefault: 'Mon skin', author: 'Auteur ?',
      galleryList: (l) => 'Skins de la galerie :\n\n' + l + '\n\nNuméro à appliquer ?', by: (a) => ' (par ' + a + ')', galleryNA: (m) => 'Galerie indisponible ici (' + m + ')',
      unknownSkin: 'fichier de skin inconnu', unknownSlot: (s) => 'emplacement inconnu : ' + s, templateSuffix: 'gabarit',
      buildInfo: (n, list, kind, bin) => `${n} tenue(s) modifiée(s) :<br>${list}<br><br>Un nouveau fichier <b>${kind}</b> va être téléchargé (même taille que ton jeu). Ton fichier d’origine n’est pas modifié.` + (bin ? '<br>Pour un .bin : garde ton .cue et donne au nouveau .bin le même nom que l’ancien.' : ''),
      compTex: '  + texture de compétition', assembling: 'Assemblage du disque…', downloading: (n, mb) => `Téléchargement lancé : ${n} (${mb} Mo)`, skinsSuffix: ' (skins)',
      boardFound: (n) => n + ' : planche perso trouvée, chargée dans l’éditeur.', boardBad: (n) => n + ' : planche présente mais illisible.', boardNone: (n) => n + ' : pas encore de planche perso sur cette carte.',
      notCard: 'Ce fichier n’est pas une carte mémoire PS1 brute de 128 Ko (.srm / .mcd).', boardWritten: (n) => `Planche écrite. Remplace ta carte par le fichier téléchargé « ${n} » (garde une copie de l’ancienne).`,
      blocks: 'hunks CHD réécrits', vRace: 'En course', vMenu: 'Menu du jeu', menuNA: 'Pas d’aperçu menu pour cette tenue (le menu montre la tenue d’origine).', menuTex: '  + aperçu du menu (veste / pantalon)',
      tabSkins: 'Prêt-à-porter', tabSkinsSub: 'Les tenues des riders, retouchées en 3D', tabBoards: 'Atelier', tabBoardsSub: 'Ta planche perso, dessinée ou importée',
      tabPatch: 'Patchs', tabPatchSub: 'Le hack Remix : riders cachés, tricks, MAX…',
      heroLead: 'Le hack Remix, des tenues retouchées et ta propre planche pour Cool Boarders 2. Tout se fait dans ton navigateur à partir de ton jeu : aucun fichier du jeu n’est hébergé ici.',
      chip1: '❄ Patch Remix v16', chip2: 'Skins en 3D', chip3: 'Planches perso', dropSmall: '.chd, .bin ou .img — le fichier reste sur ton ordinateur', heroCap: 'Course de compétition, Remix v16',
      chooseTitle: 'Choisis ton atelier', needDisc: 'Ouvre d’abord ton jeu à l’étape 1.', otherDisc: 'Changer de jeu',
      stOriginal: 'Jeu d’origine', stRemix: 'Remix déjà installé', stOther: 'Version inconnue (déjà modifiée ?)',
      patchGo: 'Installer le Remix et télécharger', patchApplying: 'Construction du patch…', patchAlready: 'Ce jeu a déjà le Remix : rien à faire. Tu peux passer directement au Prêt-à-porter ou à l’Atelier.',
      patchSource: 'Ce fichier ne correspond pas au jeu d’origine (PAL SCES-00992). Le patch ne peut s’appliquer que sur le jeu d’origine non modifié.',
      patchNeed: 'Le patch s’installe sur le jeu d’origine (PAL SCES-00992), en .chd ou .bin.',
      patchDone: (n) => `Terminé : ${n}. Remplace ton ancien fichier par celui-ci (garde l’original de côté).`,
      withRemix: 'Installer aussi le patch Remix (ce jeu est d’origine)',
      footer: 'Projet de fan, non affilié à Sony ni à UEP Systems. Aucun fichier du jeu n’est distribué : tu dois posséder ton propre exemplaire. Code sous licence MIT.',
      ok: 'OK', cancel: 'Annuler', galleryTitle: 'Galerie de skins', skinTitle: 'Enregistrer le skin', nameLbl: 'Nom du skin', authorLbl: 'Auteur', save: 'Enregistrer', resetTitle: 'Tout effacer',
      replacesLbl: 'remplace', bImpAll: 'Importer une image (JPG/PNG)', bDrop: 'Tu peux aussi glisser une image JPG ou PNG directement sur le dessus ou sur le dessous.',
      bNose: 'spatule à gauche', bImp: 'Importer une image', bPlaceHelp: 'Place l’image : glisse-la pour la déplacer, molette (ou deux doigts) pour zoomer, Maj + molette pour tourner. Puis Valider.',
      bZoom: 'Zoom', bRot: 'Rotation', bCover: 'Remplir la face', bContain: 'Image entière', bFlip: 'Miroir', bOk: 'Valider',
      impWhere: 'Où placer cette image ?', impAll: 'Planche entière (dessus + dessous)', impTop: 'Seulement le dessus', impBot: 'Seulement le dessous', impFit: 'Remplir (recadrer)', impContain: 'Image entière (bandes)',
      examples: 'Exemples', exXmas: 'Planche de Noël', exFlames: 'Flammes', exPeak: 'Montagne',
      feat: [
        ['Riders & championnat', ['Boss, Gray et Snowman jouables en championnat, tout débloqué dès le départ (Mirror et Hard compris).', 'Hard + Mirror ensemble : L1 + R1 + X sur Competition.', 'Gray, Snowman et Boss ont leur propre nom dans les résultats ; Boss a sa propre voix.', 'Tenue cachée de Cindy / Irin dans la liste des vestes, avec aperçu dans le menu.']],
        ['Figures', ['En l’air, la croix seule fait tourner (gauche/droite = spin, haut/bas = flip).', 'Grabs avec les commandes d’origine, enchaînements « … to … » en gardant R1.', 'Carré maintenu en l’air : rotations 4× plus rapides.', 'Big Air Master : touches et figure suivante toujours affichées.']],
        ['Stats MAX', ['○ sur l’écran BOARDER bascule le rider en version MAX (toutes les barres pleines).', 'Barres de stats corrigées (TECHNIQUE / POWER).']],
        ['Course & correctifs', ['Boarder Cross : fonce dans un adversaire et il tombe.', 'Planches SPECIAL toujours disponibles.', 'Ciel et voix corrigés avec Boss, Gray et Snowman.']],
      ],

    },
    en: {
      build: 'Build the modded game…',
      openTitle: 'Open your game',
      openText: 'Pick your Cool Boarders 2 <b>.chd</b> or <b>.bin</b> (PAL, with or without the Remix patch). Everything runs in your browser: nothing is uploaded anywhere.',
      drop: 'Drop the file here or <u>click to choose it</u>',
      front: 'Front', back: 'Back', paint3d: 'paint on the model', spin: 'auto-rotate', viewHelp: 'right-click / drag beside = rotate · wheel = zoom',
      tBrush: '✎ Brush', tTint: '◐ Tint', tTintTip: 'Changes the colour but keeps the folds and shading', tFill: '▧ Fill', tFillTip: 'Fills an area of similar colour',
      tPick: '⦿ Picker', tErase: '⌫ Eraser', tEraseTip: 'Restores the original texture', size: 'Size', tol: 'Tolerance', shade: 'shading', shadeTip: 'Fill keeps the shading',
      undo: 'Undo', reset: 'Clear all', tpl: 'Export PNG template', imp: 'Import PNG', saveSkin: 'Save skin…', loadSkin: 'Load a skin', gallery: 'Gallery',
      mcTitle: 'Memory card', mcText: 'Your Batocera save: <code>/userdata/saves/psx/</code> (the game’s <b>.srm</b> file, or <b>_1.mcd</b> depending on the emulator). Quit the game before replacing the file.',
      mcOpen: 'Open my card', mcNew: 'Blank card', board: 'Board',
      boardHelp: 'Style and type set how the board rides in races (as in the game’s editor). 32 colours max, as in the game.',
      bSave: 'Write to the card and download', bClear: 'Fill all', bImpTop: 'Image on top', bImpBot: 'Image underneath', bExport: 'Export PNG',
      bTopLbl: 'TOP (nose on the left)', bHalfLbl: '↑ upper half = top · lower half = bottom', preview: 'Preview', top: 'TOP', bottom: 'BOTTOM',
      buildTitle: 'Build the modded game', close: 'Close', create: 'Build',
      combo: (j, p) => `Jacket ${j} · Pants ${p}`, hidden: (k, j) => `Hidden outfit ${k} (jacket ${j})`, color: (k) => `Colour ${k}`,
      opening: (n, mb) => `Opening ${n} (${mb} MB)…`, notCB2: 'this disc is not Cool Boarders 2 (PAL)', discOK: (k, n) => `${k} OK, ${n} files.`, error: (m) => 'Error: ' + m,
      confirmReset: 'Clear every edit of this outfit?', noEdit: 'This outfit has no edits.', skinName: 'Skin name?', skinDefault: 'My skin', author: 'Author?',
      galleryList: (l) => 'Gallery skins:\n\n' + l + '\n\nNumber to apply?', by: (a) => ' (by ' + a + ')', galleryNA: (m) => 'Gallery not available here (' + m + ')',
      unknownSkin: 'unknown skin file', unknownSlot: (s) => 'unknown slot: ' + s, templateSuffix: 'template',
      buildInfo: (n, list, kind, bin) => `${n} outfit(s) edited:<br>${list}<br><br>A new <b>${kind}</b> file will be downloaded (same size as your game). Your original file is not changed.` + (bin ? '<br>For a .bin: keep your .cue and give the new .bin the same name as the old one.' : ''),
      compTex: '  + competition texture', assembling: 'Assembling the disc…', downloading: (n, mb) => `Download started: ${n} (${mb} MB)`, skinsSuffix: ' (skins)',
      boardFound: (n) => n + ': custom board found, loaded into the editor.', boardBad: (n) => n + ': a board is there but cannot be read.', boardNone: (n) => n + ': no custom board on this card yet.',
      notCard: 'This file is not a raw 128 KB PS1 memory card (.srm / .mcd).', boardWritten: (n) => `Board written. Replace your card with the downloaded file “${n}” (keep a copy of the old one).`,
      blocks: 'CHD hunks rewritten', vRace: 'In race', vMenu: 'Game menu', menuNA: 'No menu preview for this outfit (the menu shows the original one).', menuTex: '  + menu preview (jacket / pants)',
      tabSkins: 'Ready-to-wear', tabSkinsSub: 'Riders’ outfits, repainted in 3D', tabBoards: 'Workshop', tabBoardsSub: 'Your own board, drawn or imported',
      tabPatch: 'Patches', tabPatchSub: 'The Remix hack: hidden riders, tricks, MAX…',
      heroLead: 'The Remix hack, repainted outfits and your own board for Cool Boarders 2. Everything runs in your browser from your own game: no game files are hosted here.',
      chip1: '❄ Remix patch v16', chip2: '3D skins', chip3: 'Custom boards', dropSmall: '.chd, .bin or .img — the file stays on your computer', heroCap: 'Competition race, Remix v16',
      chooseTitle: 'Pick your workshop', needDisc: 'Open your game in step 1 first.', otherDisc: 'Change game',
      stOriginal: 'Original game', stRemix: 'Remix already installed', stOther: 'Unknown version (already modified?)',
      patchGo: 'Install Remix and download', patchApplying: 'Building the patch…', patchAlready: 'This game already has Remix: nothing to do. Go straight to Ready-to-wear or the Workshop.',
      patchSource: 'This file does not match the original game (PAL SCES-00992). The patch only applies to the unmodified original game.',
      patchNeed: 'The patch installs on the original game (PAL SCES-00992), as .chd or .bin.',
      patchDone: (n) => `Done: ${n}. Replace your old file with this one (keep the original somewhere safe).`,
      withRemix: 'Also install the Remix patch (this game is the original)',
      footer: 'Fan project, not affiliated with Sony or UEP Systems. No game files are distributed: you need your own copy. Code under the MIT licence.',
      ok: 'OK', cancel: 'Cancel', galleryTitle: 'Skin gallery', skinTitle: 'Save the skin', nameLbl: 'Skin name', authorLbl: 'Author', save: 'Save', resetTitle: 'Clear all',
      replacesLbl: 'replaces', bImpAll: 'Import an image (JPG/PNG)', bDrop: 'You can also drop a JPG or PNG straight onto the top or the bottom.',
      bNose: 'nose on the left', bImp: 'Import an image', bPlaceHelp: 'Place the image: drag it to move it, wheel (or two fingers) to zoom, Shift + wheel to rotate. Then Apply.',
      bZoom: 'Zoom', bRot: 'Rotation', bCover: 'Fill the face', bContain: 'Whole image', bFlip: 'Mirror', bOk: 'Apply',
      impWhere: 'Where should this image go?', impAll: 'Whole board (top + bottom)', impTop: 'Top only', impBot: 'Bottom only', impFit: 'Fill (crop)', impContain: 'Whole image (bars)',
      examples: 'Examples', exXmas: 'Christmas board', exFlames: 'Flames', exPeak: 'Mountain',
      feat: [
        ['Riders & championship', ['Boss, Gray and Snowman playable in the championship, everything unlocked from the start (Mirror and Hard too).', 'Hard + Mirror together: L1 + R1 + X on Competition.', 'Gray, Snowman and Boss have their own names in the results; Boss has his own voice.', 'Cindy / Irin hidden outfit in the jacket list, with a menu preview.']],
        ['Tricks', ['In the air, the D-pad alone rotates (left/right = spin, up/down = flip).', 'Grabs with the original buttons, “… to …” combos by holding R1.', 'Hold Square in the air: rotations 4× faster.', 'Big Air Master: buttons and next trick always shown.']],
        ['MAX stats', ['○ on the BOARDER screen switches the rider to MAX (all bars full).', 'Stat bars fixed (TECHNIQUE / POWER).']],
        ['Racing & fixes', ['Boarder Cross: ram an opponent and they fall.', 'SPECIAL boards always available.', 'Sky and voices fixed with Boss, Gray and Snowman.']],
      ],

    },
  };
  let lang = 'fr';
  try { lang = localStorage.getItem('cb2lang') || ((navigator.language || 'fr').startsWith('fr') ? 'fr' : 'en'); } catch (e) {}
  const listeners = [];
  const t = (k, ...a) => { const v = D[lang][k] ?? D.fr[k] ?? k; return typeof v === 'function' ? v(...a) : v; };
  function apply() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((e) => (e.textContent = t(e.dataset.i18n)));
    document.querySelectorAll('[data-i18n-html]').forEach((e) => (e.innerHTML = t(e.dataset.i18nHtml)));
    document.querySelectorAll('[data-i18n-title]').forEach((e) => (e.title = t(e.dataset.i18nTitle)));
    document.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
    listeners.forEach((f) => f());
  }
  function set(l) { lang = l; try { localStorage.setItem('cb2lang', l); } catch (e) {} apply(); }
  root.I18N = { t, set, apply, onChange: (f) => listeners.push(f), get lang() { return lang; } };
})(this);
