# Genesis Bastion — Évolution Génétique & Survie 3D

**Genesis Bastion** est un jeu d'action-survie 3D roguelike développé avec **Three.js** et **Vite**, combinant :
1. **Dynamique des populations façon Jeu de la Vie de Conway** (effet Allee de sous-population, fenêtre de reproduction optimale, surpopulation et famine par épuisement de biomasse).
2. **Algorithme génétique darwinien en temps réel** (génome continu, calcul explicite du `fitnessScore` combinant statistiques normalisées et mutations, croisement héréditaire, et **cycle de vie Bébé $\rightarrow$ Adulte**).
3. **Arbre phylogénétique et hybridation inter-espèces** entre espèces sœurs compatibles (*Goblorc*, *Olog-Troll*, *Warg-Lion*, *Griffon Sauvage*, *Drak-Troll*, etc.).
4. **Mutations mendéliennes dominantes & Chasse aux Patients Zéro** orchestrée par des **Éclaireurs (Scouts) PNJ** qui partent en expédition lointaine dans les terres sauvages, fuient le danger et alertent le joueur avant qu'une lignée mutante (ex. *Troll de Feu*) ne devienne l'espèce dominante de l'île.

---

## Démarrage Rapide & Commandes CLI

Toutes les commandes s'exécutent à la racine du projet :

```bash
# 1. Installer les dépendances (Three.js & Vite)
npm install

# 2. Lancer la simulation génétique & écologique headless (Mode Test / Dry-Run)
npm run dry-run

# Optionnel : personnaliser le nombre de cycles ou la graine PRNG
node scripts/dry-run-sim.js --dry-run --ticks=30 --seed=20261009 --verbose

# 3. Lancer le serveur de développement 3D (strictement lié à 127.0.0.1:5173)
npm run dev

# 4. Compiler le bundle de production dans dist/
npm run build
```

---

## Contrôles en Jeu (Vue 3D Tactique / Isométrique 3/4)

| Touche / Action | Fonction |
| :--- | :--- |
| **`WASD` / `ZQSD` / Flèches** | Déplacement 3D fluide du Héros |
| **`Espace` / `Clic Gauche`** | Attaque de fente circulaire (**Cleave 3D**) *(automatique en mode Vampire Survivors)* |
| **`1` / `2` / `3` / `4`** | Lancer les **Sorts 3D Évolutifs** en mode Actif Diablo *(auto-cast en mode Vampire Survivors)* |
| **`C` / `B`** | Basculer en direct entre le mode **Auto (Vampire Survivors)** et **Actif (Diablo)** / Ouvrir le sélecteur |
| **`Shift` / `Clic Droit`** | Esquive rapide (**Dash / Roulade**) |
| **`E`** | Interagir : libérer un PNJ en cage, récolter bois/cristal, **récupérer une Relique / Arme Élémentaire**, ou **construire sur un socle 3D** |
| **`K`** | Ouvrir / Fermer l'**Armurerie des Artefacts Élémentaires (Feu, Glace, Foudre, Venin Symbiotique)** *(met le jeu en pause)* |
| **`V`** | **Activer le Dôme-Bouclier Planétaire de l'Île** (`3/3` Reliques) & passer à l'**Île Suivante** *(met le jeu en pause)* |
| **`H`** | Ouvrir / Fermer la modale **Architecte du Bastion (5 Bâtiments Niv. 0 $\rightarrow$ 3)** *(met le jeu en pause)* |
| **`R` / `F` ou Glisser Clic Droit** | Rotation orbitale de la caméra 3D tactique *(découplée de `E` Récolte et `Q` Déplacement)* |
| **`Molette Souris`** | Zoom / Dézoom tactique (vue rapprochée action $\leftrightarrow$ vue stratégique écosystème) |
| **`Tab`** | Ouvrir / Fermer le **Codex de l'Arbre Phylogénétique & Génome** *(met le jeu 100% en pause)* |
| **`P`** | Passer l'**Onboarding Guidé en 7 Actes** et éveiller immédiatement l'écosystème |
| **`G`** | Afficher / Masquer la **Grille de Densité de Conway** sur la Minimap |
| **`T`** | **[Labo Test]** Forcer immédiatement un **Cycle Écologique (Eco-Tick)** |
| **`M`** | **[Labo Test]** Faire apparaître un **Patient Zéro (Troll de Feu)** dans la nature |
| **`X`** | **[Labo Test]** Tester l'**Écran Game Over Roguelike** & la musique triste **Lyria « Requiem des Cendres » (64 BPM)** |
| **`J`** | **Basculer en direct entre les Modèles 3D Blender 5.0 (`.glb`) et les Maillages Procéduraux Classiques** |
| **`F1`..`F5`** | Construire / Améliorer les **5 Bâtiments du Bastion** (Tour de Guet, Scierie, Bio-Labo, Guilde des Éclaireurs, Cœur) |

---

## Architecture Modulaire du Projet

Conformément aux principes de forte modularité et de configuration centralisée, le code est découpé par domaine fonctionnel :

```text
genesis-bastion/
├── index.html                        # Coquille HTML5 sémantique avec CSP stricte
├── package.json                      # Scripts npm (dev, build, dry-run) & dépendances
├── vite.config.js                    # Serveur Vite lié exclusivement à 127.0.0.1
├── README.md                         # Guide utilisateur, commandes et vue d'ensemble
├── Design.md                         # Spécifications mathématiques, génétiques et IA
├── public/assets/models/             # 14 modèles 3D PBR subdivisés (.glb) générés via Blender 5.0 MCP
├── scripts/
│   ├── generate-blender-models.py    # Script Python Blender 5.0 (bpy) sculptant et exportant les 14 modèles .glb
│   └── dry-run-sim.js                # Simulateur CLI headless (--dry-run) sur 30 cycles + test Game Over & Blender 3D
└── src/
    ├── config.js                     # Configuration centralisée (WORLD, ECO, SPECIES, PHYLOGENY_DIST, MUTATIONS...)
    ├── main.js                       # Boucle principale requestAnimationFrame, Game Over Roguelike & orchestration
    ├── utils/
    │   ├── logger.js                 # Journalisation structurée avec anneau mémoire (INFO, WARN, EVOLUTION, ALERT)
    │   └── math.js                   # PRNG Mulberry32, Bruit de Perlin 2D, FBM, utilitaires géométriques
    ├── world/
    │   ├── SceneManager.js           # Rendu Three.js, dôme atmosphérique Hillaire, cycle jour/nuit, Bloom, Caméra 3/4
    │   ├── Terrain.js                # Île 3D procédurale (5 biomes), shader océan Gerstner/mousse, végétation instanciée
    │   └── VFXManager.js             # Particules 3D (naissance ADN, combat, mort), Balises Reliques & Dôme Planétaire
    ├── ecosystem/
    │   ├── Phylogeny.js              # Matrice phylogénétique 11x11, règles d'hybridation et noms d'hybrides
    │   ├── Genome.js                 # Génome continu, calcul de fitness (stats + mutations), croisement mendélien
    │   └── EcosystemSimulator.js     # Grille 24x24 du Jeu de la Vie de Conway, biomasse, maturité Bébé -> Adulte
    ├── entities/
    │   ├── BlenderModelManager.js    # Chargeur GLTFLoader, cache des 14 modèles .glb Blender 5.0 & bascule temps réel [J]
    │   ├── CreatureMeshBuilder.js    # Morphologie 3D hybride (Modèles .glb Blender 5.0 + greffes génétiques/mutations)
    │   ├── EnemyManager.js           # IA ennemie, croissance Bébé (0.5x) -> Adulte (1.0x), famine et éradication
    │   ├── PlayerController.js       # Contrôles action-roguelike du joueur, mort Roguelike, grâce & remise à zéro
    │   └── BastionAndNPCs.js         # Sanctuaire central, cages, Autels d'Armes, Reliques d'Éden et IA Éclaireurs
    ├── audio/
    │   └── SoundManager.js           # Musique adaptative Lyria Realtime + 5 stems Lyria 3 (dont Requiem Game Over 64 BPM), voix Gemini TTS FR & SFX WebAudio
    ├── ui/
    │   ├── CharacterPortraitsConfig.js # Portraits Nano Banana (Aldric, Kaelen, Troll de Feu, Dragon, Requin, Taupe) & Simagrées
    │   ├── HUDManager.js             # Interface tactique DOM (zéro innerHTML), Modale Game Over, Forge [K], Dôme [V], Bascule 3D [J]
    │   └── Minimap.js                # Radar 2D temps réel (biomasse Conway, cônes de vue Éclaireurs, balises Mutants & Reliques)
    └── styles/
        └── main.css                  # Design système cartographique & biologique dark-fantasy
```

---

## Boucle de Gameplay : Le Scénario du « Troll de Feu »

1. **Émergence Silencieuse** : Lors d'un cycle écologique dans les terres sauvages (ou dès la génération initiale), un **Troll** subit une mutation spontanée `pyro_gland` (*Glande Pyroclastique / Feu*).
2. **Stade Juvénile (Bébé $\rightarrow$ Adulte)** : Toute nouvelle naissance apparaît d'abord au stade **Bébé** (`0.5x` taille, `0.55x` stats) et **ne peut pas se reproduire** avant d'avoir atteint sa maturité (`20s`).
3. **Expédition des Éclaireurs** : Vous libérez des survivants et les assignez au rôle d'**Éclaireur (Scout)**. Ces PNJ quittent le Bastion pour explorer les confins sauvages (`45` à `105` unités), fuient automatiquement les monstres proches (`FLEE_RADIUS = 16`), mais balayent une large zone (`VISION_RADIUS = 34`).
4. **Alerte Patient Zéro** : Dès qu'un Éclaireur aperçoit le Troll de Feu (ou un hybride inédit), une **Alerte Prioritaire** retentit sur le HUD, un **Faisceau Céleste** s'élève en 3D sur la position du monstre, et sa lignée apparaît dans le **Radar Génétique**.
5. **Course contre l'Évolution** : Parce que les mutations sont **mendéliennes dominantes (78% à 92% de transmission)** et augmentent fortement le `fitnessScore`, si le Troll de Feu adulte se reproduit, ses enfants hériteront presque tous du gène du feu. En quelques générations, toute l'espèce Troll deviendra ignée !
6. **Éradication Ciblée** : Le joueur utilise la boussole et la minimap pour traquer et éliminer le Patient Zéro (et ses éventuels descendants juvéniles avant leur maturité), éradiquant la lignée mutante avant l'extinction du Bastion.

---

## Mort Roguelike, Musique Triste Lyria (« Requiem des Cendres ») & Choix de Fin de Run (`v0.9.0`)

Lorsque les PV du Gardien tombent à `0` (ou que le Cœur du Sanctuaire est détruit par un siège) — ou à tout moment via le bouton Labo **`💀 Tester Game Over [X]`** / touche **`X`** :
1. **Pause Stricte & Requiem Lyria (64 BPM)** : La simulation se met immédiatement en pause, le directeur musical bascule sur le 5e stem **Lyria 3 `lyria_gameover_requiem.mp3`** (*Requiem des Cendres en Ré mineur, violoncelle solo mélancolique, piano lent et chœur éthéré à 64 BPM*, joué à plein volume sans atténuation de pause) accompagné de l'élégie vocale française d'**Aldric** (`alert_gameover_requiem.wav`).
2. **Bilan Complet de l'Expédition** : La modale affiche la cause de la défaite ainsi que 6 cartes récapitulatives (Île atteinte, Niveau & Mode de combat, Arme Élémentaire équipée, Sorts 3D & Rangs de Maîtrise, Monstres & Mutants éliminés, Reliques d'Éden & Génération darwinienne).
3. **Deux Options Explicites** :
   - **`🔄 Repartir à Zéro (Nouvelle Run Roguelike — Niv. 1, Île #1)`** : Applique la vraie règle Roguelike en réinitialisant intégralement le Héros au Niveau 1, les Bâtiments du Bastion, la Grille de Conway et la Population Sauvage sur l'Île #1 (`resetForNewRoguelikeRun()`).
   - **`✨ Continuer quand même (Grâce Temporaire du Sanctuaire — 100% PV)`** : Relève le Gardien devant le Sanctuaire avec `100 % PV`, `+60 Rations`, une onde de choc dorée qui repousse les assaillants, et conserve toute la progression acquise.

---

## Modèles 3D Blender 5.0 MCP (`.glb` PBR) & Architecture Multi-Versions (`v0.10.0`)

La version **`v0.10.0-blender-mcp-3d-models`** (branche `blender-3d-models`) intègre **14 modèles 3D `.glb` PBR subdivisés et lissés** générés directement via **Blender 5.0.1 MCP** (`scripts/generate-blender-models.py` $\rightarrow$ `public/assets/models/*.glb`) :
- **Personnages & Structures** : `hero_guardian.glb` (Gardien en armure obsidienne/or, cape cramoisie, bouclier runique & espadon `Weapon`), `npc_survivor.glb` (Éclaireur à lanterne dorée), `bastion_monolith.glb` (Monolithe de Relique d'Éden).
- **Bestiaire Darwinien Complet (11 espèces)** : `goblin.glb`, `orc.glb`, `troll.glb`, `wolf.glb`, `lion.glb`, `vulture.glb`, `dragon.glb`, `shark.glb` (Requin Marcheur amphibie), `giant_mole.glb` (Taupe Géante à museau étoilé), `deer.glb`, `rabbit.glb`.
- **Bascule Temps Réel (`[J]` / Bouton HUD)** : Appuyez sur **`J`** ou cliquez sur **`🎨 Modèles 3D : Blender (.glb) [J]`** pour comparer instantanément en plein jeu les modèles `.glb` Blender 5.0 et les maillages procéduraux historiques (sans recharger la page).
- **Double Serveur en Parallèle** :
  - **Version Blender 3D (`.glb`)** : `http://giom-us.c.googlers.com:5173/` (branche `blender-3d-models`)
  - **Version Classique Procédurale (`v0.9.0`)** : `http://giom-us.c.googlers.com:5174/` (branche `v0.9-classic-procedural`, accessible en 1 clic via le bouton `⏪ Version Classique (5174)` de l'en-tête).

---

## Équilibrage Tactique de la Maîtrise Adaptative (`<= 1%` / Monstre à Rendement Décroissant) & des Upgrades (`v0.11.0`)

Pour garantir une progression tactique mesurée sans inflation de statistiques :
- **Maîtrise Tueur d'Espèce & Briseur de Mutation (`<= 1 %` par monstre avec décroissance rapide)** :
  - **Kills `1..5`** : **`+1,0 %` par monstre** (`+1 %` à 1 kill, `+3 %` au Rang 2 à 3 kills, `+5 %` à 5 kills).
  - **Kills `6..15`** : **`+0,5 %` par monstre** (`+5,5 %` au Rang 3 à 6 kills, `+7,5 %` au Rang 4 à 10 kills, `+10,0 %` au Rang 5 à 15 kills).
  - **Kills `16+`** : **`+0,25 %` par monstre**, plafonné strictement à **`+15,0 %` maximum** par espèce/mutation (plafond cumulé total `1.30x` soit `+30 %` grand max).
- **Résistance Adaptative aux Coups Subis** : **`+0,5 %` par coup** élémentaire/venin (`1..6`), puis **`+0,25 %`** (`7..22`), puis **`+0,15 %`** (plafond **`10 %` max** ; physique plafonné à **`6 %` max**).
- **Échelle des Sorts 3D, Cartes Passives & Armes Élémentaires** :
  - **Sorts 3D (Niv. 1 $\rightarrow$ 5)** : **`+8 %` dégâts** et **`+4 %` portée** par niveau (`-4 %` temps de recharge).
  - **Cartes Passives de Level-Up** : Bonus réalistes de **`+8 %` à `+12 %`** (`+10 %` mêlée, `+8 %` vitesse, `+10 %` cadence, `+12 %` élémentaire, `+15 PV max`).
  - **Armes Élémentaires Légendaires (`[K]`)** : **`+10 %` à `+12 %` de dégâts de base** et **`+15 %` contre leur clade cible**.

---

## Optimisation Ultra-Fluide 60 FPS & Découplage Clavier `[E]` / `[R-F]` (`v0.12.0`)

Pour garantir une fluidité constante à **60 FPS** (y compris sous WebGL Cloudtop) :
1. **Découplage Strict `[E]` Récolte / `[R-F]` Caméra** : La touche **`[E]`** est dédiée exclusivement à l'interaction contextuelle (récolter bois/cristal, ouvrir une cage, forger une arme, bâtir sur socle), tandis que la rotation clavier de la caméra est assignée à **`[R]` / `[F]`** (ou `Clic Droit + Glisser`).
2. **Zéro DOM Thrashing 60 Hz (`HUDManager` & `Minimap`)** : Mémoïsation par signature d'état des listes de lignées (`_lastLineageListSig`) et de la bannière d'Onboarding (`_lastOnboardingBannerSig`), cadencement des panneaux lourds à `~7 Hz` (`140ms`) et du radar Minimap 2D à `~12 Hz` (`80ms`).
3. **Cache Bilinéaire $O(1)$ de Hauteur & Biome (`Terrain.js`)** : Précalcul d'une grille `257x257` (`Float32Array`) pour `getHeightAt(x, z)` et `129x129` pour `getBiomeAt(x, z)`, éliminant des centaines d'évaluations FBM/Perlin par frame, avec géométrie d'île et d'océan allégée.
4. **Modèles `.glb` Low-Poly Stylisés & Cache de Matériaux (`BlenderModelManager.js`)** : Réduction de **85 %** du nombre de sommets des 14 modèles `.glb` (`~450–1 200` sommets avec lissage de normales), mutualisation des matériaux PBR teintés (`materialCache`) et ombres portées limitées au tronc principal (`Body`).
5. **Culling Spatial & LOD d'Animation (`EnemyManager.js`)** : Masquage et mise en veille d'animation des créatures éloignées (`> 95m` hors Patients Zéro), animation 1 frame sur 4 à moyenne distance (`> 48m`), et scan de fuite des herbivores cadencé à `4 Hz`.

---

## Menu des Paramètres (`⚙️ Settings [O]`) & Localisation Bilingue Intégrale (`🇬🇧 English` par défaut / `🇫🇷 Français` en 2e choix — `v0.13.0`)

La version **`v0.13.0-settings-menu-and-bilingual-en-fr`** introduit un **Menu des Paramètres complet (`⚙️ Settings [O]`)** et une **architecture bilingue temps réel (`src/utils/i18n.js`)** couvrant l'intégralité de l'interface et des voix **Gemini TTS** :
1. **Langue par Défaut (`🇬🇧 English`) & Bascule Temps Réel (`🇫🇷 Français`)** :
   - Le jeu démarre par défaut en **Anglais (`'en'`)** avec le **Français (`'fr'`)** en second choix.
   - Le changement de langue dans **`⚙️ Settings [O]`** met à jour instantanément (sans recharger la page) tous les panneaux du HUD, la bannière d'Onboarding en 7 Actes, les Quêtes Dynamiques, la Forge d'Armes, l'Architecte du Bastion, le Codex Phylogénétique, la Minimap et les bulles d'actions 3D $\rightarrow$ 2D.
2. **Doublage Vocal Bilingue Gemini TTS (15 Voix EN + 15 Voix FR)** :
   - **Commandant Aldric (`Fenrir`)** et **Archiviste Kaelen (`Kore`)** disposent chacun des **15 répliques en Anglais** (`public/assets/audio/tts/en/*.wav`) et des **15 répliques en Français** (`public/assets/audio/tts/*.wav`) couvrant les 7 Actes du tutoriel et les 8 alertes critiques (Patient Zéro, Courroux du Dragon, Requins Marcheurs, Taupes Géantes, Crise du Gibier, Reliques d'Éden, Dôme-Bouclier, Requiem de Game Over).
   - Un bouton **`🔈 Preview Voice / Tester la Voix (Aldric & Kaelen)`** dans le menu Settings permet d'écouter immédiatement le doublage dans la langue sélectionnée.
3. **Mixeur Audio & Contrôles Graphiques / Gameplay (`⚙️ Settings [O]`)** :
   - Réglage indépendant du volume **Musique Lyria 3**, **Voix Gemini TTS** et **SFX de Combat** (`0%` à `100%`) + bouton Mute (`[M]`).
   - Bascules directes pour le **Mode de Combat** (`⚡ Auto Vampire Survivors` / `⚔️ Active Diablo [1-4]`), les **Modèles 3D** (`🎨 Blender 5.0 .glb` / `📐 Procédural Classique [J]`), le **Post-Processing Bloom** (`✨ Bloom ON` / `⚡ Direct 60FPS OFF`) et la **Grille de Conway** (`[G]`).

