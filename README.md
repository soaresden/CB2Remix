# Cool Boarders 2 Remix

👉 **https://soaresden.github.io/Cb2Remix/**

🇬🇧 **English:** a browser tool for **Cool Boarders 2** (PS1, PAL SCES-00992) in three parts: **Patches** installs the Remix hack on your original game, **Ready-to-wear** repaints the riders' outfits with a live 3D preview (in race and in the game menu), and **Workshop** designs your own snowboard and writes it to your memory card. FR / EN switch at the top. No game files are included: everything is read from your own `.chd` / `.bin`, in your browser.

🇫🇷 **Français :** outil web en trois parties, à partir de **ton propre** `.chd` ou `.bin` (rien n'est envoyé nulle part, aucun fichier du jeu n'est hébergé ici) :

| | |
|---|---|
| **Patchs** | Installe le hack Remix v26 sur le jeu d'origine. |
| **Prêt-à-porter** | Repeins les tenues des 7 riders, avec aperçu 3D en course et dans le menu du jeu. |
| **Atelier** | Dessine, importe (JPG / PNG) ou pars d'un motif d'origine du jeu, et écris ta planche dans ta carte mémoire. |
| **Musiques** | Écoute la bande-son du jeu et télécharge-la en MP3 ou en WAV. |

## 1. Patchs (Remix v26, à la carte)

Ouvre le jeu **d'origine** (PAL SCES-00992, `.chd` ou `.bin`), coche les mods que tu veux, puis **Construire et télécharger**.

- **Interrupteurs** : 17 mods indépendants (tout débloqué, planches SPECIAL partout, Hard + Mirror, Boss/Gray/Snowman en championnat, tenues cachées de Cindy et Irin, stats MAX, figures en l'air, chocs en Boarder Cross, Big Air Master, progression dans le jeu, qualifications au choix, Jicchi/Nick/Kelly jouables (récompense des 100 %), vue arrière avec Rond, annonces de déblocage au retour de course, notes du half-pipe en direct, classement, radar et boost (R2, à la SSX) du Boarder Cross, écran REMIX dans le jeu (sous OPTIONS) où chaque mod se règle, en trois onglets), avec un aperçu.
- **Préréglages** : *Remix complet*, *100 % à gagner* (toutes les améliorations, mais riders cachés, pistes, planches, Mirror et Hard se gagnent comme dans le jeu d'origine), *Aucun mod*.
- **Musiques** (européennes ou américaines, avec ton CD US en .chd) et **tenues du Prêt-à-porter** à inclure.
- **Code de configuration** `CB2-XXXX-XXXX` : il résume tous ces choix. Copie-le ou partage le lien (le code est dans l'adresse), recolle-le plus tard : le même code redonne exactement le même jeu. Il est aussi écrit dans le jeu construit, que le site reconnaît ensuite.

Le patch ne contient que les octets écrits par le Remix et des références vers ton propre disque, jamais de données du jeu (les portraits de Jicchi, Nick et Kelly sont décodés de la vidéo de ton disque au moment du patch). Le même code marche avec le patcheur Batocera et `make_remix.py --config` du dépôt de décompilation.

## 2. Prêt-à-porter (skins)

1. Choisis un rider et une tenue (comme dans l'écran WEAR : *Veste n · Pantalon n*, *Tenue cachée 1 à 3* pour Cindy et Irin).
2. Peins sur la texture ou directement sur le modèle 3D (pinceau, teinte qui garde les plis, remplissage, pipette, gomme). Bascule **En course / Menu du jeu** pour voir le rendu dans le menu de sélection.
3. **Créer le jeu modifié…** télécharge un nouveau `.chd` (ou `.bin`). Sur un jeu d'origine, une case permet d'installer le Remix en même temps.

Galerie d'exemples : *Père Noël* (Yaggi), *Matou roux* (Yaggi), *Pop star* (Irin), *Cambrioleuse* (Cindy).

### Fichier de skin (`.cb2skin.json`)

« Enregistrer le skin… » produit un petit JSON qui dit **quelle tenue il remplace** (`rider`, `slot`, `replaces`) et ne contient que **tes pixels** (PNG 128×256, transparent ailleurs).

### Proposer un skin

1. Ajoute ton fichier dans `skins/` (`mon-skin.cb2skin.json`).
2. Ajoute une ligne dans `skins/index.json` (nom, auteur, `rider`, `slot`, `replaces`).
3. Ouvre une *pull request* : le skin apparaîtra dans la **Galerie**.

Merci de proposer des créations originales (pas de personnages, logos ou marques existants).

### Propositions de tenues (recettes)

La galerie contient 5 propositions par rider (Yaggi, Jin, Cindy, Irin, Boss, Gray et Snowman) : Arctique, Volcan, Camouflage, Néon, Or et noir, Bonbon, Noir et blanc, Lagon, Rétro 90, Coucher de soleil. Ce sont des **recettes** de couleurs (fichiers `skins/remix-*.cb2skin.json`, format version 2) appliquées dans ton navigateur à la texture de ton propre disque : la peau est conservée, le blanc du Snowman aussi, et aucun pixel du jeu n'est stocké dans le dépôt. Elles se cochent aussi dans l'onglet Patchs et entrent dans le code de configuration (jusqu'à 64 tenues).

## 3. Atelier (planches)

1. Ouvre ta carte mémoire (Batocera : `/userdata/saves/psx/`, le `.srm` du jeu ou le `_1.mcd`) ou pars d'une carte vierge.
2. Le dessus et le dessous ont chacun leur zone. Dessine, pars d'un des **21 motifs d'origine** du jeu (lus sur ton disque :
   6 par style, communs aux TYPE-1, 2 et 3, plus les 3 planches SPECIAL), choisis un exemple (Noël, Flammes, Montagne) ou **importe une image JPG / PNG** sur la face voulue (bouton ou glisser-déposer), puis place-la : glisser pour la déplacer, molette ou deux doigts pour zoomer et tourner, et **Valider**.
3. Style (Free Style / All-Around / Alpine) et type (1 à 3), puis **Écrire dans la carte et télécharger**.
4. Jeu fermé, remplace ta carte par le fichier téléchargé. Dans le jeu : **Board Edit** → *Load*.

32 couleurs maximum, comme dans l'éditeur du jeu.

L'Atelier écrit la planche pour la version du jeu ouvert (européenne ou américaine : le format est le même, seul le nom
de la sauvegarde change). Pour **convertir** une planche, ouvre le jeu de l'autre version, ouvre ta carte puis
**Écrire dans la carte** : la planche est copiée sous le nom de cette version, l'originale reste sur la carte.

## 4. Musiques

Les musiques sont les pistes audio du disque (`/CDDA/BGM*.DA`). L'onglet les lit sur ton CHD, les joue dans la page et les
convertit en MP3 (128 à 320 kb/s, avec titre et numéro de piste) ou en WAV sans perte, une par une ou toutes dans un zip.
L'encodeur MP3 ([lamejs](https://github.com/zhuker/lamejs), LGPL) est chargé depuis jsDelivr la première fois. Avec une image
`.bin` seule, les pistes ne sont trouvées que si le fichier contient tout le disque.

## 5. Progression (100 %)

Dans le jeu (mod « Progression dans le jeu ») : maintiens **SELECT** sur l'écran des modes.

Sur le site : Ouvre ta carte mémoire (`.srm` de Batocera/pcsx_rearmed, `.mcr`, `.mcd`, `.mc`, `.gme`, `.vmp`, `.mcs`, `.psv`) : la page lit ta sauvegarde de Cool Boarders 2 et affiche ta checklist (riders cachés, Mirror, Hard, planches SPECIAL, 30 trophées du Free Style) avec le pourcentage et la condition de chaque déblocage, lue dans le code du jeu. Pas besoin du disque pour cet onglet.

## Limites connues

- Boss utilise en compétition une texture à part, pas encore modifiée.
- Le menu de sélection n'affiche pas les retouches de Boss, Gray, Snowman ni des tenues cachées.

## Technique

- `disc.js` : CHD v5 (LZMA / Deflate / FLAC, pistes audio) et BIN, ISO 9660, EDC/ECC ; seuls les blocs modifiés sont réécrits ; application du patch `CB2D`.
- `cb2.js` : modèles PMD, textures FBD 4 bits. `menu.js` : modèles TMD et TIM du menu (`TITLE/CHR.DAT`), transfert de texture course → menu.
- `board.js` : format `ORGBOARD` et cartes mémoire brutes de 128 Ko.
- `flac.js` : décodeur FLAC des blocs audio des CHD. `music.js` : onglet Musiques (WAV, MP3 via lamejs, zip).
- Rendu 3D : three.js r128.

Projet de fan, non affilié à Sony ni à UEP Systems. Code sous licence MIT.
