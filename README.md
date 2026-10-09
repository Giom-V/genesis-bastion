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
| **`Espace` / `Clic Gauche`** | Attaque de fente circulaire (**Cleave 3D**) |
| **`Shift` / `Clic Droit`** | Esquive rapide (**Dash / Roulade**) |
| **`E`** | Interagir : libérer un PNJ en cage, récolter bois/cristal, se soigner au Bastion |
| **`Q` / `E` ou Glisser Clic Droit** | Rotation orbitale de la caméra 3D tactique |
| **`Molette Souris`** | Zoom / Dézoom tactique (vue rapprochée action $\leftrightarrow$ vue stratégique écosystème) |
| **`Tab`** | Ouvrir / Fermer le **Codex de l'Arbre Phylogénétique & Génome** |
| **`T`** | **[Labo Test]** Forcer immédiatement un **Cycle Écologique (Eco-Tick)** |
| **`M`** | **[Labo Test]** Faire apparaître un **Patient Zéro (Troll de Feu)** dans la nature |
| **`1` / `2` / `3`** | Actions rapides du Bastion (Assigner Éclaireur, Garde, Récolteur) |

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
│   └── dry-run-sim.js                # Simulateur CLI headless (--dry-run) sur 30 cycles
└── src/
    ├── config.js                     # Configuration centralisée (WORLD, ECO, SPECIES, PHYLOGENY_DIST, MUTATIONS...)
    ├── main.js                       # Boucle principale requestAnimationFrame & orchestration
    ├── utils/
    │   ├── logger.js                 # Journalisation structurée avec anneau mémoire (INFO, WARN, EVOLUTION, ALERT)
    │   └── math.js                   # PRNG Mulberry32, Bruit de Perlin 2D, FBM, utilitaires géométriques
    ├── world/
    │   ├── SceneManager.js           # Rendu Three.js, dôme atmosphérique Hillaire, cycle jour/nuit, Bloom, Caméra 3/4
    │   ├── Terrain.js                # Île 3D procédurale (5 biomes), shader océan Gerstner/mousse, végétation instanciée
    │   └── VFXManager.js             # Particules 3D (naissance ADN, combat, mort) & Faisceau Céleste Patient Zéro
    ├── ecosystem/
    │   ├── Phylogeny.js              # Matrice phylogénétique 7x7, règles d'hybridation et noms d'hybrides
    │   ├── Genome.js                 # Génome continu, calcul de fitness (stats + mutations), croisement mendélien
    │   └── EcosystemSimulator.js     # Grille 24x24 du Jeu de la Vie de Conway, biomasse, maturité Bébé -> Adulte
    ├── entities/
    │   ├── CreatureMeshBuilder.js    # Morphologie 3D procédurale pilotée par le génome, les hybrides et les mutations
    │   ├── EnemyManager.js           # IA ennemie, croissance Bébé (0.5x) -> Adulte (1.0x), famine et éradication
    │   ├── PlayerController.js       # Contrôles action-roguelike du joueur, combat, récolte et améliorations
    │   └── BastionAndNPCs.js         # Sanctuaire central, cages de survivants, Gardes, Récolteurs et IA Éclaireurs
    ├── ui/
    │   ├── HUDManager.js             # Interface tactique DOM (zéro innerHTML), Alertes Éclaireurs, Codex Phylogénétique
    │   └── Minimap.js                # Radar 2D temps réel (biomasse Conway, cônes de vue Éclaireurs, balises Mutants)
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
