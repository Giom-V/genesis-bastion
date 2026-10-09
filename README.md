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
| **`Q` / `E` ou Glisser Clic Droit** | Rotation orbitale de la caméra 3D tactique |
| **`Molette Souris`** | Zoom / Dézoom tactique (vue rapprochée action $\leftrightarrow$ vue stratégique écosystème) |
| **`Tab`** | Ouvrir / Fermer le **Codex de l'Arbre Phylogénétique & Génome** *(met le jeu 100% en pause)* |
| **`P`** | Passer l'**Onboarding Guidé en 7 Actes** et éveiller immédiatement l'écosystème |
| **`G`** | Afficher / Masquer la **Grille de Densité de Conway** sur la Minimap |
| **`T`** | **[Labo Test]** Forcer immédiatement un **Cycle Écologique (Eco-Tick)** |
| **`M`** | **[Labo Test]** Faire apparaître un **Patient Zéro (Troll de Feu)** dans la nature |
| **`X`** | **[Labo Test]** Tester l'**Écran Game Over Roguelike** & la musique triste **Lyria « Requiem des Cendres » (64 BPM)** |
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
├── scripts/
│   └── dry-run-sim.js                # Simulateur CLI headless (--dry-run) sur 30 cycles + test Game Over Reset
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
    │   ├── CreatureMeshBuilder.js    # Morphologie 3D procédurale pilotée par le génome, les hybrides et les mutations
    │   ├── EnemyManager.js           # IA ennemie, croissance Bébé (0.5x) -> Adulte (1.0x), famine et éradication
    │   ├── PlayerController.js       # Contrôles action-roguelike du joueur, mort Roguelike, grâce & remise à zéro
    │   └── BastionAndNPCs.js         # Sanctuaire central, cages, Autels d'Armes, Reliques d'Éden et IA Éclaireurs
    ├── audio/
    │   └── SoundManager.js           # Musique adaptative Lyria Realtime + 5 stems Lyria 3 (dont Requiem Game Over 64 BPM), voix Gemini TTS FR & SFX WebAudio
    ├── ui/
    │   ├── CharacterPortraitsConfig.js # Portraits Nano Banana (Aldric, Kaelen, Troll de Feu, Dragon, Requin, Taupe) & Simagrées
    │   ├── HUDManager.js             # Interface tactique DOM (zéro innerHTML), Modale Game Over, Forge [K], Dôme [V], Codex [Tab]
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

