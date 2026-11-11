# Cool Boarders 2 Remix

👉 **https://soaresden.github.io/Cb2Remix/**

🇬🇧 **English:** a browser tool for **Cool Boarders 2** (PS1, PAL SCES-00992) in three parts: **Patches** installs the Remix hack on your original game, **Ready-to-wear** repaints the riders' outfits with a live 3D preview (in race and in the game menu), and **Workshop** designs your own snowboard and writes it to your memory card. FR / EN switch at the top. No game files are included: everything is read from your own `.chd` / `.bin`, in your browser.

🇫🇷 **Français :** outil web en trois parties, à partir de **ton propre** `.chd` ou `.bin` (rien n'est envoyé nulle part, aucun fichier du jeu n'est hébergé ici) :

| | |
|---|---|
| **Patchs** | Installe le hack Remix v16 sur le jeu d'origine. |
| **Prêt-à-porter** | Repeins les tenues des 7 riders, avec aperçu 3D en course et dans le menu du jeu. |
| **Atelier** | Dessine ou importe (JPG / PNG) ta planche et écris-la dans ta carte mémoire. |

## 1. Patchs (Remix v16)

Ouvre le jeu **d'origine** (PAL SCES-00992, `.chd` ou `.bin`) puis **Installer le Remix et télécharger**. Le site reconnaît un jeu d'origine, un jeu déjà Remix ou une autre version (dans ce cas le patch est refusé).

Le patch est un petit fichier de différences (`patches.js`, environ 22 Ko) : il ne contient que les octets écrits par le Remix et des références vers ton propre disque, jamais de données du jeu.

Ce qu'apporte le Remix :
- Boss, Gray et Snowman jouables en championnat, tout débloqué (Mirror et Hard compris) ; Hard + Mirror avec L1 + R1 + X.
- Noms et voix propres pour Boss, Gray et Snowman ; tenue cachée de Cindy / Irin dans la liste des vestes.
- Figures : la croix seule fait tourner en l'air, grabs d'origine, enchaînements « … to … », Carré = rotations 4× plus rapides, Big Air Master avec touches et figure suivante.
- Stats MAX avec ○ sur l'écran BOARDER.
- Boarder Cross : fonce dans un adversaire et il tombe.
- Planches SPECIAL toujours disponibles, correctifs ciel et voix.

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

## 3. Atelier (planches)

1. Ouvre ta carte mémoire (Batocera : `/userdata/saves/psx/`, le `.srm` du jeu ou le `_1.mcd`) ou pars d'une carte vierge.
2. Dessine, choisis un exemple (Noël, Flammes, Montagne) ou **importe une image JPG / PNG** (bouton ou glisser-déposer) : planche entière, dessus seul ou dessous seul.
3. Style (Free Style / All-Around / Alpine) et type (1 à 3), puis **Écrire dans la carte et télécharger**.
4. Jeu fermé, remplace ta carte par le fichier téléchargé. Dans le jeu : **Board Edit** → *Load*.

32 couleurs maximum, comme dans l'éditeur du jeu.

## Limites connues

- Boss utilise en compétition une texture à part, pas encore modifiée.
- Le menu de sélection n'affiche pas les retouches de Boss, Gray, Snowman ni des tenues cachées.

## Technique

- `disc.js` : CHD v5 (LZMA / Deflate) et BIN, ISO 9660, EDC/ECC ; seuls les blocs modifiés sont réécrits ; application du patch `CB2D`.
- `cb2.js` : modèles PMD, textures FBD 4 bits. `menu.js` : modèles TMD et TIM du menu (`TITLE/CHR.DAT`), transfert de texture course → menu.
- `board.js` : format `ORGBOARD` et cartes mémoire brutes de 128 Ko.
- Rendu 3D : three.js r128.

Projet de fan, non affilié à Sony ni à UEP Systems. Code sous licence MIT.
