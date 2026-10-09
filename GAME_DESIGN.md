# GENESIS BASTION — Document de Game Design & Équilibrage Systémique (`GAME_DESIGN.md`)

> **Philosophie de Design** : Dans *Genesis Bastion*, l'écosystème ne « triche » pas avec des vagues d'ennemis scriptées artificielles. La menace émerge organiquement de la rencontre entre **le Jeu de la Vie de Conway** (densité spatiale et biomasse), **la Sélection Naturelle Darwinienne** (croisement génétique, hybridation phylogénétique et mutations mendéliennes dominantes) et **le Brouillard d'Information** percé uniquement par vos **Éclaireurs (Scouts)** envoyés au péril de leur vie dans les terres sauvages profondes (*Deep Wilderness*).

---

## 1. Les Trois Boucles de Gameplay Imbriquées

Le cœur de l'expérience repose sur l'interaction permanente entre trois boucles qui opèrent à des échelles de temps complémentaires :

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ 1. BOUCLE ÉCOLOGIQUE (Arrière-plan continu — Eco-Tick toutes les 12s)   │
  │    Densité de Conway (2..6) ──► Croisement Darwinien ──► Naissance BÉBÉ │
  │    Maturation (16s..38s) ──► ADULTE Reproducteur ──► Dominance Mutante  │
  └───────────────────┬─────────────────────────────────────▲───────────────┘
                      │ Émergence d'un Patient Zéro         │ Éradication de la lignée
                      ▼ ou d'une Famine locale              │ ou Purge de biomasse
  ┌─────────────────────────────────────────────────────────┴───────────────┐
  │ 2. BOUCLE D'INFORMATION (Exploration — Temps réel)                      │
  │    Sauvetage PNJ en Cage ──► Assignation ÉCLAIREUR ──► Expédition       │
  │    Hors-Frontière (50..108u) ──► Esquive (Flee) & Alerte Patient Zéro   │
  └───────────────────┬─────────────────────────────────────────────────────┘
                      │ Faisceau 3D + Alerte Boussole + Compte à rebours
                      ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ 3. BOUCLE D'INTERVENTION ROGUELIKE (Décision Tactique du Joueur)        │
  │    Option A : Sprinter hors du Bastion assassiner le Bébé/Patient Zéro  │
  │    Option B : Récolter & Fortifier le Bastion contre la horde affamée   │
  │    Level-Up : Choisir une Contre-Adaptation ciblant la mutation active  │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 1.1. Boucle Écologique (Conway + Génétique + Cycle Bébé → Adulte)
Toutes les **12 secondes** (`CONFIG.ECO.TICK_INTERVAL`), le monde de $240 \times 240$ unités découpé en une grille de $24 \times 24$ cellules écologiques évalue ses populations :
1. **Sous-population (Effet Allee, $< 2$ voisins dans un rayon de $22$ unités)** : L'individu est isolé (`lonely = true`). Il ne peut pas se reproduire et cherche à rejoindre un congénère compatible.
2. **Fenêtre Optimale ($2$ à $6$ voisins et Biomasse $> 10$)** : Les **Adultes** (`isAdult === true`) se reproduisent. Les parents sont sélectionnés proportionnellement à leur **`fitnessScore` darwinien**.
3. **Stade Juvénile Obligatoire (`lifeStage: 'baby'`)** : Tout nouveau-né issu d'un croisement naît à l'état de **Bébé** (`isAdult: false`, échelle 3D `0.5x`, PV et dégâts réduits à `55%`, métabolisme réduit à `50%`). **Un Bébé ne peut absolument pas se reproduire** tant qu'il n'a pas achevé sa croissance vers le stade **Adulte** (`16s` à `38s` selon l'espèce).
4. **Surpopulation & Famine ($> 6$ individus ou Biomasse $\le 10$)** : La cellule bascule en famine (`starving = true`). Les créatures perdent des PV ($4.5\text{ PV/s}$) et migrent agressivement vers les plaines centrales — c'est-à-dire droit sur le **Bastion du joueur**.

### 1.2. Boucle d'Information (Sauvetage PNJ → Éclaireurs Hors-Frontière → Radar Patient Zéro)
Le joueur ne dispose pas d'une omniscience gratuite sur les mutations qui naissent à l'autre bout de l'île :
1. **Sauvetage & Recrutement** : En explorant l'île, le joueur libère des survivants enfermés dans **6 cages de prisonniers** (ou recrute via les ressources du Bastion) et les affecte à trois rôles : **Récolteur**, **Garde** ou **Éclaireur (`scout`)**.
2. **Expédition en *Deep Wilderness* (`pickScoutExpeditionWaypoint`)** : Contrairement aux Gardes qui défendent les murs, les Éclaireurs partent en expédition lointaine dans une couronne de **50 à 108 unités** du centre. Notre algorithme les dirige prioritairement vers la **Caldeira Volcanique (Nord-Est / Nord-Ouest)**, les **Hautes Terres** et les **Forêts profondes**, là où émergent les pires prédateurs mutants.
3. **Survie par l'Esquive (`computeScoutEvasionVector`)** : Fragiles ($60\text{ PV}$), les Éclaireurs fuient automatiquement (`state = 'fleeing'`) dès qu'un monstre entre dans leur rayon de sécurité ($16\text{ unités}$), contournant les meutes grâce à un vecteur de répulsion pondéré.
4. **Identification du Patient Zéro** : Dès qu'un mutant ou hybride entre dans le cône de vision d'un Éclaireur ($34\text{ unités}$, extensible par le Bio-Labo et la *Fauconnerie*), une **Alerte Prioritaire** retentit, un **Faisceau Céleste 3D** verrouille la cible à l'horizon, et la lignée est déverrouillée dans le Radar Génétique et le Codex Phylogénétique.

### 1.3. Boucle d'Intervention Roguelike (Assassiner la Lignée vs Fortifier le Bastion)
Chaque alerte d'Éclaireur crée un **dilemme stratégique immédiat** :
- **Scénario d'Assassinat Chirurgical ("Tuer l'œuf dans le nid")** : Un Éclaireur repère un *Troll — Glande Pyroclastique (Feu)* fraîchement né au stade **Bébé** à $72\text{ unités}$ au Nord-Est. Le joueur dispose d'environ **28 à 36 secondes** avant que ce juvénile ne devienne Adulte et ne transmette son gène dominant ($78\%$) à toute sa tribu. S'il fonce immédiatement, il affronte une cible affaiblie ($0.55\times$ stats) et **éradique la lignée mutante** d'un seul coup !
- **Scénario d'Endiguement & Siège** : Si le joueur tarde ou préfère récolter du bois/cristal pour ériger des *Tours de Guet* et des *Palissades*, le Patient Zéro devient adulte et dissémine sa mutation. La tribu de Trolls de Feu prolifère rapidement jusqu'à dépasser le seuil de densité de Conway ($> 6$), épuise la biomasse volcanique et déclenche une **Migration de Famine** massive vers le Bastion.

---

## 2. Calibrage de la Fenêtre de Réaction Juvénile (`getMaturationProfile`)

Pour que la chasse au Patient Zéro juvénile soit **palpitante mais toujours équitable**, la durée de maturation de chaque espèce dans [`BalanceAndPacing.js`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/ecosystem/BalanceAndPacing.js) est calibrée sur la cinématique de déplacement du joueur :

- **Vitesse de course du joueur** : $13.5\text{ u/s}$ (jusqu'à $16.7\text{ u/s}$ avec *Bottes d'Expédition* ou $19.5\text{ u/s}$ avec *Traqueur de Patient Zéro*, plus le Dash à $30\text{ u/s}$ toutes les $1.4\text{s}$).
- **Temps de traversée moyen Bastion $\rightarrow$ Deep Wilderness ($75\text{ unités}$)** : $\approx 5.0\text{s}$ en ligne droite, soit **$9\text{ à }13\text{s}$** en conditions réelles (temps de réaction à l'alerte + contournement d'obstacles + duel).

| Espèce | Clade | Durée de Maturation (`maturationTime`) | Offset Mutation (ex. *Pyro* / *Titan*) | Fenêtre Effective avant 1er Eco-Tick Adulte | Temps de Trajet + Combat Joueur ($75\text{u}$) | Marge Tactique du Joueur |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Gobelin** | Peaux-Vertes | `16.0 s` | `+0s` à `+5s` | **24.0 s** (2 Eco-Ticks) | ~10 s | **+14 s** (Rapide, prolifique) |
| **Loup** | Bêtes Sauvages | `18.0 s` | `+0s` à `+5s` | **24.0 s** (2 Eco-Ticks) | ~11 s | **+13 s** (Meute mobile) |
| **Vautour** | Bêtes Sauvages | `20.0 s` | `-2s` à `+5s` | **24.0 s** (2 Eco-Ticks) | ~11 s | **+13 s** (Crêtes rocheuses) |
| **Orc** | Peaux-Vertes | `22.0 s` | `+0s` à `+5s` | **24.0 s** (2 Eco-Ticks) | ~12 s | **+12 s** (Guerrier médian) |
| **Lion** | Bêtes Sauvages | `24.0 s` | `+0s` à `+5s` | **24.0 s – 36.0 s** | ~13 s | **+11 à 23 s** (Prédateur des plaines) |
| **Troll** | Peaux-Vertes | `28.0 s` | `+2s` (*Pyro*) = `30.0 s` | **36.0 s** (3 Eco-Ticks) | ~15 s | **+21 s** (Cible prioritaire iconique) |
| **Dragon** | Prédateurs Apex | `38.0 s` | `+2s` à `+5s` = `40.0 s+` | **48.0 s** (4 Eco-Ticks) | ~18 s | **+30 s** (Boss de la caldeira lointaine) |

---

## 3. Modèle Mathématique du `fitnessScore` & Auto-Régulation Métabolique

Dans [`BalanceAndPacing.js`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/ecosystem/BalanceAndPacing.js) (`computeDetailedFitness`) et [`Genome.js`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/ecosystem/Genome.js), la valeur sélective d'un individu est définie par :

$$\text{FitnessTotal} = \underbrace{\left( \sum_{i} w_i \cdot \frac{G_i}{G_{i,\text{ref}}} \right) \cdot \left( \frac{M_{\text{ref}}}{M} \right)^{0.24}}_{\text{statsScore (Performance / Coût Métabolique)}} + \underbrace{\sum_{m \in \text{Mutations}} B_m + S_{\text{poly}}}_{\text{mutationsScore}} + B_{\text{biome}} + B_{\text{hybride}}$$

où les poids normalisés des traits valent :
- $w_{\text{strength}} = 0.26$, $w_{\text{maxHp}} = 0.24$, $w_{\text{speed}} = 0.18$, $w_{\text{fertility}} = 0.14$, $w_{\text{size}} = 0.10$, $w_{\text{aggroRadius}} = 0.08$ ($\sum w_i = 1.00$).
- **Avantage reproducteur darwinien** : Un *Troll de Feu* (`pyro_gland`, $B_m = +0.45$, multiplicateurs de force $\times 1.45$ et PV $\times 1.25$) atteint un `fitnessScore` de **`1.78`** contre **`1.00`** pour un Troll sauvage. Lors d'un Eco-Tick en densité optimale, il a donc **78% de chances supplémentaires d'être choisi comme parent**, et transmet son gène dominant à **78%** (1 parent porteur) ou **92%** (2 parents porteurs).
- **Frein écologique anti-emballement (Le Paradoxe du Prédateur Apex)** : Chaque mutation puissante augmente le coût métabolique (`metabolismCost` : $\times 1.15$ pour *Pyro*, $\times 1.35$ pour *Titan*). Or, une cellule écologique régénère `BIOMASS_REGEN = 18` unités de biomasse par cycle, et chaque naissance consomme `22` unités de biomasse.
  - Une meute de 5 Gobelins sauvages consomme $5 \times 3.2 = 16.0$ biomasse/tick ($< 18$, équilibre durable).
  - Une meute de 5 Trolls de Feu consomme $5 \times (7.2 \times 1.15) = 41.4$ biomasse/tick ($> 18$) ! En seulement 2 à 3 cycles de prolifération, les Trolls de Feu épuisent leur territoire, tombent en **Famine (`starving = true`)**, cessent de se reproduire et sont forcés de migrer vers le Bastion ou de mourir d'inanition.

---

## 4. Preuve d'Équilibre Dynamique (Simulation Empirique sur 30 Cycles)

L'exécution du simulateur déterministe sans interface (`npm run dry-run`, graine `20261009`, 30 Eco-Ticks = 6 minutes de temps de jeu accéléré sans intervention du joueur) démontre mathématiquement que le système :
1. **Ne s'éteint jamais instantanément** (grâce au regroupement territorial et au seuil minimal $N \ge 2$).
2. **N'explose jamais jusqu'à faire ramer le moteur 3D** (auto-régulé entre `56` et `97` individus bien en dessous du plafond de sécurité `130` grâce à la déplétion de biomasse et aux famines de Conway).
3. **Valide la loi de dominance mendélienne** (les porteurs de mutations passent de $2.3\%$ au Tick 1 à $61.9\%$ au Tick 30 si le joueur n'intervient pas).

| Eco-Tick | Temps Écoulé | Population Totale (Adultes / Bébés) | Naissances (Bébés) | Maturations (Bébé → Adulte) | En Famine (`starving`) | Porteurs de Mutations (dont *Pyro*) | Hybrides Inter-Espèces | Alertes Éclaireurs (*Deep Wilderness*) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | `12 s` | **56** (`43 Ad` / `13 Bb`) | `+13` | `0` | `11` | **1** (`1 Pyro` — *Patient Zéro*) | `1` | `1` |
| **2** | `24 s` | **67** (`43 Ad` / `24 Bb`) | `+12` | `0` *(Bébés < 20s)* | `9` | **4** (`1 Pyro`) | `6` | `9` |
| **5** | `60 s` | **97** (`74 Ad` / `23 Bb`) | `+10` | `+9` | `45` *(Pic de famine)* | **9** (`2 Pyro`) | `13` | `13` |
| **10** | `120 s` | **80** (`64 Ad` / `16 Bb`) | `+8` | `+4` | `40` | **15** (`2 Pyro`) | `24` | `23` |
| **15** | `180 s` | **64** (`56 Ad` / `8 Bb`) | `+2` | `+4` | `34` | **16** (`3 Pyro`) | `30` | `43` |
| **20** | `240 s` | **58** (`48 Ad` / `10 Bb`) | `+5` | `+5` | `16` *(Regain biomasse)* | **22** (`4 Pyro`) | `26` | `51` |
| **25** | `300 s` | **68** (`60 Ad` / `8 Bb`) | `+3` | `+7` | `35` | **36** (`3 Pyro`) | `32` | `68` |
| **30** | `360 s` | **63** (`59 Ad` / `4 Bb`) | `+3` | `+3` | `36` | **39** (**61.9%** de l'île) | `28` | `88` |

> **Analyse de la courbe** : On observe un cycle prédateur-ressource de type **Lotka-Volterra discret** :
> - **Ticks 1–2 (Fenêtre d'or du joueur)** : Les 13 puis 24 nouveau-nés sont encore au stade **Bébé** (`Matured = 0`). Le *Patient Zéro* (`Pyro`) est toujours seul (`1` porteur). C'est le moment exact où l'alerte de l'Éclaireur invite le joueur à frapper !
> - **Ticks 5–10 (Expansion & Surchauffe Biomasse)** : Les premiers bébés deviennent adultes et se reproduisent. La population atteint `97`, déclenchant une famine locale sur `45` individus qui régule naturellement la démographie et lance des vagues de migration vers le Bastion.
> - **Ticks 15–30 (Équilibre Dynamique & Remplacement Génétique)** : La population oscille proprement autour de **60–68 individus**, mais sa composition génétique a radicalement muté : **61.9% des créatures sont désormais mutantes** et **44% sont des hybrides fertiles** (*Goblorc*, *Olog-Troll*, *Drak-Troll*, *Griffon Sauvage*).

---

## 5. Matrice des Contre-Adaptations Roguelike (`DESIGNED_UPGRADES` — Phase 11 Équilibrée `+8%` à `+12%`)

À chaque montée de niveau (XP gagnée en éliminant des monstres et surtout des Patients Zéro), le système [`pickCounterAdaptationUpgrades`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/ecosystem/BalanceAndPacing.js) analyse l'état actuel de l'écosystème (`hasActivePyro`, `activeMutantCount`, `starvingCount`) pour proposer 3 cartes de contre-adaptation ciblées aux bonus mesurés (`+8%` à `+12%`) :

| Amélioration Roguelike | Catégorie | Effet Mécanique Exact | Menace Écologique Contre-Carrée |
| :--- | :--- | :--- | :--- |
| **🎯 Traqueur de Patient Zéro** | Traque Génétique | `+10%` vitesse de course, `+10%` dégâts de fente et `+12%` dégâts contre une mutation repérée par un Éclaireur. | **Émergence d'un Patient Zéro** dans les confins sauvages avant son passage à l'âge adulte. |
| **🦅 Fauconnerie d'Éclaireur** | Renseignement | `+12%` portée de vision des Éclaireurs hors-frontière et `+10%` vitesse d'expédition/fuite. | **Brouillard de guerre** dans la Caldeira Volcanique et mortalité des Éclaireurs. |
| **🧬 Purge Juvénile & Terre Brûlée** | Écologie Conway | Tuer un mutant ou un Bébé draine **12% de la biomasse** de sa cellule, `+12%` dégâts vs Bébés et `+8%` fente. | **Cellules à densité optimale (2–5)** : affame artificiellement la meute pour bloquer son prochain Eco-Tick. |
| **🏰 Muraille d'Épines & Balistes** | Bastion | `+60 PV` au Bastion, `+12%` dégâts des Tours de Guet et renvoie `6` dégâts d'épines aux assaillants. | **Migrations de Famine** déclenchées par les cellules en surpopulation ($> 6$). |
| **🛡️ Lame Pyrophage & Égide Cryo** | Contre-Mutation | Réduit de **8%** les dégâts élémentaires (*Feu*, *Venin*, *Givre*), élargit l'arc de `+0.5m` et `+8%` fente. | **Dominance de la Glande Pyroclastique** (*Trolls de Feu*) et des *Dragons*. |
| **🥾 Bottes d'Expédition Véloce** | Mobilité | `+8%` vitesse permanente et `-15%` temps de recharge d'esquive (Dash). | **Compte à rebours Eco-Tick ($12\text{s}$)** lors des traversées d'un bout à l'autre de l'île. |
| **❤️ Sang d'Ambre Régénérant** | Survie | `+15 PV Max`, soin immédiat de `25 PV` et régénération passive de `+1.0 PV/s`. | **Guerre d'usure** lors des expéditions prolongées loin du feu de camp du Bastion. |

---

## 6. Pause Tactique Stricte & Choix du Style de Combat (`Vampire Survivors` vs `Diablo`)

Défini dans [`src/ecosystem/RoguelikeAbilitiesAndMastery.js`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/ecosystem/RoguelikeAbilitiesAndMastery.js) (`COMBAT_MODES`), le système de combat respecte deux règles d'ergonomie fondamentales :

### 6.1. Pause Stricte pendant les Modales (`isModalPaused = true`)
Dès que la modale de **Montée de Niveau (Level-Up)**, la modale d'accueil ou le **Codex Phylogénétique (`[Tab]`)** est ouverte :
- **La simulation physique, les déplacements ennemis, les projectiles et les minuteries d'Eco-Tick sont 100% mis en pause**.
- Le joueur dispose d'un bandeau explicite **`⏸️ JEU EN PAUSE — Prenez tout votre temps pour lire et choisir votre compétence`** afin d'analyser ses synergies sans jamais subir de dégâts injustes en arrière-plan.

### 6.2. Deux Philosophies de Gameplay permutables à la volée (`[C]`)
Au lancement de la partie (et à tout instant via le bouton du HUD ou la touche **`[C]`**), le joueur choisit son mode de contrôle :
1. **🧛 Mode `vampire_survivors` (Auto-Battler / Auto-Cast)** :
   - Le joueur se concentre à 100% sur son **positionnement (`ZQSD`/`WASD`)**, ses **esquives (`Shift`)** et ses **décisions stratégiques** (expéditions, sauvetages, traque de Patient Zéro).
   - Le Héros **frappe automatiquement à l'épée** dès qu'un ennemi entre dans son cercle de portée ET **déclenche automatiquement toutes ses compétences 3D équipées** dès que leur temps de recharge est prêt et qu'une cible est à portée.
   - Compétence de départ offerte : **🌀 Lames Orbitales Spectrales (Niv. 1)**.
2. **⚔️ Mode `diablo_action` (Action-RPG Viscéral)** :
   - Le joueur déclenche manuellement ses frappes de fente (**`Clic Gauche`** / **`Espace`**), son esquive (**`Clic Droit`** / **`Shift`**) et **ses 4 sorts actifs équipés avec les touches `[1]`, `[2]`, `[3]`, `[4]`** (les raccourcis de construction du Bastion basculent sur `F1`/`F2`/`F3`).
   - Compétence de départ offerte : **🔥 Nova Pyroclastique (Niv. 1)**.

---

## 7. Arsenal des 8 Sorts 3D Évolutifs (`ROGUELIKE_ABILITIES`, Niv. 1 → 5 — Scaling Mesuré `+8%/niv.`)

Chaque montée de niveau propose 3 cartes tirées via `drawRoguelikeLevelUpChoices()`, permettant de débloquer jusqu'à 4 sorts actifs/auto-cast et de les faire évoluer jusqu'au **Niveau 5** avec une progression équilibrée (**`+8%` dégâts par niveau**, **`+4%` portée par niveau**, **`-4%` temps de recharge par niveau**) :

| Sort 3D (`id`) | Icône & Catégorie | Dégâts Base → Niv. 5 (`+8%/niv.`) | Recharge Base → Niv. 5 (`-4%/niv.`) | Mécanique 3D & Rôle Tactique | Affinité Génétique |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Lames Orbitales** (`spinning_blades`) | 🌀 Orbite 3D Permanente | `18` → `24` / coup | Permanent (`4.5s` pulse) | **2 à 6 lames spectrales** tournent en orbite autour du Héros et tranchent tout ennemi au contact. | `goblin` / `winged_leap` |
| **Nova Pyroclastique** (`pyro_nova`) | 🔥 Explosion de Feu | `42` → `55` (+Brûlure) | `5.2s` → `4.37s` | Onde de choc circulaire de magma (`8.5m` → `9.9m`) calcinant les meutes denses. | `troll` / `pyro_gland` |
| **Arc Foudroyant** (`chain_lightning`) | ⚡ Foudre en Chaîne | `34` → `45` / cible | `3.8s` → `3.19s` | Éclair 3D haute tension rebondissant instantanément de **3 à 7 ennemis**. | `vulture` / `winged_leap` |
| **Javelot Cryogénique** (`frost_spear`) | ❄️ Perforation & Gel | `38` → `50` | `3.2s` → `2.69s` | Lance de glace perforante (`1` à `3` projectiles) qui **ralentit de 50%** : idéal pour bloquer un Patient Zéro ! | `wolf` / `cryo_blood` |
| **Salve Venimeuse** (`venom_volley`) | 🧪 Barrage Toxique | `22` → `29` (+Poison) | `3.6s` → `3.02s` | Éventail de **5 à 13 dagues neurotoxiques** infligeant un poison sur la durée (DoT). | `orc` / `venom_sacs` |
| **Météore d'Ambre** (`meteor_strike`) | ☄️ Frappe Anti-Apex | `68` → `90` (AoE) | `7.0s` → `5.88s` | Cible automatiquement l'ennemi au **plus haut `fitnessScore`** (ou Patient Zéro) et abat un météore explosif. | `dragon` / `titan_growth` |
| **Siphon Vampirique** (`soul_siphon`) | 🩸 Drain Hématophage | `32` → `42` | `5.5s` → `4.62s` | Rayon cramoisi reliant **2 à 6 cibles** au Héros et convertissant **45% à 65%** des dégâts en soin immédiat. | `lion` / `vampiric_maw` |
| **Onde Sismique** (`seismic_slam`) | 🔨 Onde & Stun | `36` → `48` | `5.0s` → `4.20s` | Frappe tellurique qui **repousse violemment (`5.5m+`)** et **étourdit (`1.4s` → `2.4s`)** la horde entourant le joueur. | `troll` / `osteo_plating` |

---

## 8. Apprentissage & Adaptation par l'Action (`AdaptiveMasterySystem` — `≤ 1%` par Monstre & Rendements Décroissants)

Pour que le Héros progresse de manière granulaire sans jamais trivialiser l'écosystème, la classe [`AdaptiveMasterySystem`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/ecosystem/RoguelikeAbilitiesAndMastery.js) applique une courbe **strictement inférieure ou égale à `+1.0%` par monstre éliminé avec rendements décroissants rapides** :

1. **⚔️ Maîtrise de Chasse par Espèce (`computeSpeciesSlayerBonusPct(kills)`)** :
   - **Kills `1..5`** : **`+1.0%` par kill** (`1%` à `1` kill $\rightarrow$ `5.0%` à `5` kills).
   - **Kills `6..15`** : **`+0.5%` par kill** (`5.5%` à `6` kills $\rightarrow$ `10.0%` à `15` kills).
   - **Kills `16+`** : **`+0.25%` par kill**, plafonné à **`+15.0%` maximum** (atteint à `35` kills).
   - Paliers de notification d'interface : **`1`, `3`, `6`, `10`, `15` éliminations** (`+1%`, `+3%`, `+5.5%`, `+7.5%`, `+10%`).
2. **🧬 Maîtrise Anti-Mutation & Affinité Élémentaire (`computeMutationSlayerBonusPct(kills)`)** :
   - Même courbe à rendements décroissants (**`+1.0%` sur les kills `1..5`, `+0.5%` sur `6..15`, `+0.25%` sur `16+`**, plafonnée à **`+15.0%` max**).
   - Le multiplicateur adaptatif total combiné (Espèce + Mutations) via `getDamageMultiplierAgainst(enemy)` est plafonné à **`1.30` (`+30%` grand maximum)**.
   - Augmente modérément de **`+15%` (`×1.15`)** la probabilité que l'arbre de Level-Up propose le sort élémentaire correspondant.
3. **🛡️ Résistance Corporelle Adaptative (`computeResistanceBonusPct(hits, isPhysical)`)** :
   - **Résistance Élémentaire (`fire`, `venom`, `cryo`)** : **`+0.5%` par coup reçu** (`1..6` coups = `0.5%..3.0%`), puis **`+0.25%/coup`** (`7..22` coups = `3.25%..7.0%`), puis **`+0.15%/coup`** (`23+`), plafonné à **`10.0%` max**.
   - **Endurcissement Physique (`physical`)** : **`+0.4%` par coup reçu** (`1..5` coups = `0.4%..2.0%`), puis **`+0.2%/coup`** (`6+`), plafonné à **`6.0%` max**.

---

## 9. Architecture 3D du Bastion & Arbre d'Amélioration des 5 Bâtiments (Niv. 0 → 3)

Défini dans [`src/ecosystem/BaseAndQuestsDesign.js`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/ecosystem/BaseAndQuestsDesign.js) (`BASTION_BUILDINGS_CATALOG`), le développement du Bastion est à la fois **physique en 3D** (5 socles de chantier autour du feu de camp central où le joueur peut marcher et appuyer sur **`[E] Construire / Améliorer`**) et **accessible à tout moment** via le panneau gauche ou la modale d'Architecte **`[H]`** :

| Bâtiment (`id`) | Emplacement 3D & Raccourci | Niveau 1 (Coût & Effet) | Niveau 2 (Coût & Effet) | Niveau 3 (Coût & Effet) |
| :--- | :---: | :--- | :--- | :--- |
| **🔥 Cœur du Sanctuaire** (`sanctuary_hearth`) | Centre `(0, 0)`<br>`[E]` / `[F5]` | *Départ* : `500 PV` Max, Soin Héros `+15 PV/s`, Cap. `8` Survivants. | `35 Bois • 15 Cristal • 10 Biomasse`<br>`750 PV` Max, Soin `+28 PV/s`, `+15%` vitesse autour du camp. | `60 Bois • 35 Cristal • 25 Biomasse`<br>`1050 PV` Max, Soin `+45 PV/s`, Aura sacrée (`12 DPS` feu). |
| **🏹 Tour de Guet** (`watchtower`) | Nord-Est `(8.5, -7.5)`<br>`[E]` / `[F1]` | `25 Bois • 10 Cristal`<br>*Tour d'Archer* (`18` dég. / `1.35s`, portée `34m`). | `40 Bois • 20 Cristal • 10 Biomasse`<br>*Baliste Double Cryo* (`2` traits `30` dég., ralentit de `35%`). | `65 Bois • 35 Cristal • 25 Biomasse`<br>*Tour Pyrophage* (`3` traits `48` dég., **+100% dégâts vs Mutants**). |
| **🦅 Guilde des Éclaireurs** (`scout_guild`) | Nord-Ouest `(-8.5, -7.5)`<br>`[E]` / `[F2]` | `20 Bois • 15 Cristal`<br>*Poste de Fauconnerie* (`+30%` vision, `+25%` vitesse, `+1` Éclaireur). | `35 Bois • 25 Cristal • 12 Biomasse`<br>*Observatoire* (`+60%` vision, **Balise Ralentissante `-35%` sur Patient Zéro**). | `55 Bois • 40 Cristal • 25 Biomasse`<br>*Réseau Omniscient* (`+95%` vision, marquage auto des naissances mutantes). |
| **🛡️ Atelier & Remparts** (`lumber_forge` / `palisade`) | Sud-Est `(8.5, 7.5)`<br>`[E]` / `[F3]` | `30 Bois • 5 Cristal`<br>`+180 PV` Bastion, `10` dégâts d'épines, `+2 Bois / +1 Cristal` par `5s`. | `45 Bois • 20 Cristal • 10 Biomasse`<br>`+380 PV` Bastion, `22` épines, `+4 Bois / +3 Cristal` par `5s`. | `70 Bois • 35 Cristal • 20 Biomasse`<br>`+650 PV` Bastion, `38` épines, `+7 Bois / +5 Cristal / +2 Biomasse` par `5s`. |
| **🧬 Bio-Laboratoire** (`biolab`) | Sud-Ouest `(-8.5, 7.5)`<br>`[E]` / `[F4]` | `20 Bois • 20 Cristal`<br>`+15%` dégâts Héros vs Mutants, **ralentit de 20% la maturation des Bébés mutants**. | `35 Bois • 30 Cristal • 15 Biomasse`<br>`+30%` dégâts vs Mutants, **ralentit de 40% la maturation des Bébés mutants**. | `55 Bois • 45 Cristal • 30 Biomasse`<br>`+50%` dégâts vs Mutants, **ralentit de 60% la maturation des Bébés** & `+50%` XP/Biomasse. |

---

## 10. Ordres de Mission d'Éclaireurs & Quêtes Dynamiques d'Éradication (`DynamicQuestSystem`)

### 10.1. Les 4 Ordres de Mission Assignables aux Éclaireurs (`SCOUT_MISSIONS_CATALOG`)
Le joueur n'est plus spectateur passif des déplacements de ses Éclaireurs : il peut leur donner un **Ordre de Mission actif** en un clic :
1. **🔍 Traquer une Lignée Mutante (`track_lineage`)** : Vos Éclaireurs filent à `+45%` vitesse droit vers tous les porteurs non repérés (Bébés et Adultes) de la mutation sélectionnée (ex. *Trolls de Feu*), allument leur faisceau céleste 3D et maintiennent le compteur **`Repérés : X / Y porteurs`** à jour !
2. **⛓️ Secourir les Survivants (`find_cages`)** : Vos Éclaireurs localisent en priorité les Cages de Prisonniers restantes et les marquent d'un faisceau doré sur la Minimap.
3. **🌋 Explorer la Caldeira & Terres Sauvages (`scout_volcano`)** : Patrouille profonde (`50m` à `108m`) dans les biomes à forte activité mutagène.
4. **🛡️ Vigilance Frontière (`perimeter_alert`)** : Patrouille défensive autour du Bastion pour intercepter les hordes en famine.

### 10.2. Quêtes Dynamiques en 2 Phases (`DynamicQuestSystem`)
La classe `DynamicQuestSystem` génère et suit en temps réel des opérations structurées :
- **Quête Signature : « 📜 Opération : Éradication — Trolls de Feu (Glande Pyroclastique) »** :
  - **Phase 1 (Renseignement Éclaireurs)** : *« Ordonnez à vos Éclaireurs de [🔍 Traquer : Pyro / Feu] pour localiser tous les porteurs sur l'île (`Repérés : X / Y`). »*
  - **Phase 2 (Extermination & Purge Juvénile)** : *« Éliminez tous les porteurs repérés (`Restants : Y → 0`, dont les Bébés avant qu'ils ne deviennent adultes !). »*
  - **Récompense d'Opération** : `+45 Bois, +35 Cristal, +30 Biomasse, +120 XP` (déclenchant un Level-Up immédiat) et génération automatique de la prochaine opération dès qu'une nouvelle mutation apparaît sur l'île !

---

## 11. Biologie Différenciée par Espèce, Croisement à Expansion de Spectre & Souveraineté Draconique

Définis dans [`src/config.js`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/config.js) et [`src/ecosystem/BalanceAndPacing.js`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/ecosystem/BalanceAndPacing.js) (`BALANCE`, `sampleScopeExpandingGene`, `getSpeciesReproductiveAndAggroProfile`), les 7 clades/espèces obéissent à des lois biologiques et comportementales profondément asymétriques :

### 11.1. Cycles de Gestation, Maturation, Agressivité & Repeuplement par Espèce

| Espèce (`id`) | Gestation (`baseGestationTime`) | Maturation Bébé → Adulte (`baseMaturationTime`) | Agressivité (`baseAggressiveness`) & Posture (`aggroStance`) | Repeuplement Sauvage (`repopulationCooldown` / Habitat caché) |
| :--- | :---: | :---: | :--- | :--- |
| **Gobelin** (`goblin`) | `9s` | `12s` | `0.75` — **`hostile`** (Chasseur de meute et assaillant du Bastion) | `8s` — *« Des Gobelins sauvages émergent de leurs terriers forestiers ! »* |
| **Loup** (`wolf`) | `13s` | `15s` | `0.82` — **`hostile`** (Traqueur rapide des forêts denses) | `12s` — *« Des Loups sauvages quittent leurs tanières sylvestres ! »* |
| **Vautour** (`vulture`) | `15s` | `17s` | `0.38` — **`territorial`** (Charognard des crêtes ; n'attaque qu'à proximité ou affamé) | `12s` — *« Des Vautours descendent en piqué depuis les nids des falaises ! »* |
| **Orc** (`orc`) | `18s` | `22s` | `0.88` — **`hostile`** (Guerrier tribal ultra-agressif des plaines) | `16s` — *« Une patrouille d’Orcs sauvages surgit des campements enfouis ! »* |
| **Lion** (`lion`) | `24s` | `26s` | `0.70` — **`hostile`** (Prédateur dominant des plaines dorées) | `16s` — *« Un couple de Lions sauvages regagne son territoire dans les plaines ! »* |
| **Troll** (`troll`) | `30s` | `34s` | `0.48` — **`territorial`** (Colosse gardien des hautes terres ; redoutable si affamé ou provoqué) | `16s` — *« Des Trolls anciens sortent des cavernes profondes des hautes terres ! »* |
| **Dragon** (`dragon`) | **`65s`** | **`50s`** | **`0.08` — `pacifist_apex`** (**Souverain Paisible** : `680 PV`, `58 Dégâts`, `8.2 Vit.`, `2.05x Taille`, `180 XP`) | `28s` — *« Un couple de Dragons ancestraux se pose sur la caldeira volcanique ! »* |

### 11.2. Repeuplement Sauvage Permanent (Immunité d'Extinction des 7 Espèces Souches)
- **Zéro extinction définitive des espèces de base** : L'objectif du joueur est d'éradiquer des **lignées mutantes dangereuses** (ex. *Trolls de Feu*, *Loups Cryo-Ailés*), jamais de vider l'île de sa faune sauvage.
- Dès que la population vivante d'une des 7 espèces de base passe sous **`REPOPULATION_MIN_THRESHOLD = 2`** individus (0 ou 1 survivant), le chronomètre de repeuplement de l'espèce (`repopulationCooldown`, de `8s` pour les Gobelins à `28s` pour les Dragons) s'enclenche et fait émerger **2 adultes sauvages Gen-1 sains (sans mutation)** depuis leur habitat caché en bordure de leur biome de prédilection (`les terriers forestiers`, `les nids des falaises escarpées`, `les crêtes volcaniques inaccessibles`).

### 11.3. Croisement Génétique à Expansion de Spectre (`sampleScopeExpandingGene`)
Au lieu d'une moyenne arithmétique qui comprimerait les statistiques vers la médiane au fil des générations, chaque gène quantitatif (`maxHp`, `strength`, `speed`, `size`, `gestationTime`, `aggressiveness`, `fertility`, `metabolism`, `aggroRadius`) suit une loi d'héritage darwinien à **expansion de spectre** :
$$\text{ValeurBrute} \sim \mathcal{U}\big(\min(G_{\text{Père}}, G_{\text{Mère}}),\; \max(G_{\text{Père}}, G_{\text{Mère}})\big)$$
$$\text{GèneEnfant} = \text{clamp}\Big(\text{ValeurBrute} \times \mathcal{U}(0.90,\; 1.10),\; 0.35 \times G_{\text{Base}},\; 4.50 \times G_{\text{Base}}\Big)$$
- **Conséquence émergente** : Même si le Père et la Mère possèdent exactement `10` de Force, leur enfant peut naître dans l'intervalle `[9.0, 11.0]`. Si deux descendants à `11.0` et `10.5` se reproduisent ensuite, la génération suivante explore `[9.45, 12.10]`, élargissant continuellement la variance génétique soumise à la sélection naturelle de Conway !

### 11.4. Gène d'Agressivité, Dragons Souverains Paisibles & Courroux Draconique (`SPECIES_WRATH`)
- **Posture `pacifist_apex` des Dragons** : Les Dragons sont des titans majestueux (`680 PV`, `58 Dégâts`, gestation lente de `65s`, maturation de `50s`) dotés d'un gène d'agressivité de base très faible (`0.08`). Tant que le joueur ne les attaque pas directement, **ils survolent paisiblement la caldeira volcanique** sans jamais agresser le Héros, les Éclaireurs ou le Bastion (un anneau doré paisible et le badge **`🕊️ Souverain Paisible (Ne pas provoquer)`** les distinguent).
- **Protection anti-bavure de l'Auto-Tir** : En mode **Auto-Tir (Vampire Survivors)** comme pour les Tours de Guet et Gardes PNJ, le ciblage automatique **ignore les créatures `pacifist_apex` non provoquées** afin que le joueur ne déclenche jamais la colère des Dragons par accident en passant près du volcan.
- **Courroux Draconique Collectif (`SPECIES_WRATH_DURATION = 90s`)** : Si le joueur choisit délibérément de frapper un Dragon (au clic gauche `[LMB]` ou avec un sort manuel `[1]–[4]`, par exemple pour éliminer un Dragon porteur d'une mutation critique ou récolter ses `180 XP`), **tous les Dragons vivants de l'île entrent en Courroux Draconique pendant 90 secondes** (`⚡ COURROUX DRACONIQUE !`), gagnent `+25%` de vitesse de vol et convergent ensemble sur le Héros et le Bastion !

---

## 12. Émergence Progressive des Espèces Invasives & Écosystème Herbivore (`Gibier` & `🍖 Rations`)

Définis dans [`src/config.js`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/config.js) (`CLADES.abyssal`, `CLADES.herbivore`, `SPECIES.{shark,giant_mole,rabbit,deer}`, `MUTATIONS.amphibious_lungs`) et [`src/ecosystem/BalanceAndPacing.js`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/ecosystem/BalanceAndPacing.js) (`BALANCE.PROGRESSIVE_EMERGENCE`, `BALANCE.PREY_FOOD_ECONOMY`, `evaluatePreyAndFoodEconomy`), l'écosystème de **Genesis Bastion** évolue dans le temps et impose au joueur une responsabilité écologique directe :

### 12.1. Les 4 Nouvelles Espèces (Émergents Abyssaux/Souterrains & Gibier Herbivore)

| Espèce (`id`) | Clade & Émergence | Stats de Base (`PV` / `Dégâts` / `Vit.`) | Gestation / Maturation | Comportement & Rôle Écologique |
| :--- | :--- | :---: | :---: | :--- |
| **🦈 Requin Marcheur** (`shark`) | **Abyssal** — Nage en mer (`r = 88..105m`) à `0:00`, **débarque sur la plage à `40s`** | `135 PV` • `22 Dég.` • `7.8 Vit.` | `22s` / `24s` | Développe la mutation **`amphibious_lungs` (*Pattes & Branchies Amphibies*)**, déploie 4 pattes musclées sur le sable et envahit les terres ! S'hybride avec le Loup (*Squale-Garou*) et le Troll. |
| **🕳️ Taupe Géante** (`giant_mole`) | **Souterrain** — Absente à `0:00`, **jaillit du sous-sol à `65s`** | `150 PV` • `21 Dég.` • `6.4 Vit.` | `20s` / `22s` | Surgit des galeries souterraines dans une éruption de roche (`spawnBurrowEruption`). S'hybride avec le Troll (*Taupe-Colosse*) et l'Orc. |
| **🐇 Lapin des Plaines** (`rabbit`) | **Herbivore (Gibier)** — Prairies (`autoRepopulate: false`) | `26 PV` • `0 Dég.` • `9.8 Vit.` | `7.5s` / `9.5s` | **`prey_pacifist`** : Fuit à `11m`, enrichit la biomasse (`+6/tick`), donne **`+18 🍖 Rations`** et `+12 PV` si chassé. |
| **🦌 Biche Sylvestre** (`deer`) | **Herbivore (Gibier)** — Clairières (`autoRepopulate: false`) | `54 PV` • `0 Dég.` • `10.5 Vit.` | `15s` / `17s` | **`prey_pacifist`** : Fuit à `11m`, enrichit la biomasse (`+8/tick`), donne **`+35 🍖 Rations`** et `+25 PV` si chassée. S'hybride avec le Lapin (*Cerf-Lièvre Véloce*). |

### 12.2. Économie des Rations (`🍖 Rations`), Équilibre Trophique & Danger Collatéral des Sorts
1. **Rations du Bastion (`player.resources.food`, départ `60 / 150`, consommation `-1.2 Rations/s`)** :
   - **Bonus Rassasié (`Rations ≥ 25`)** : Le Héros bénéficie de **`+3.0 PV/s` de régénération** et **`+10%` de vitesse de déplacement**.
   - **Famine au Bastion (`Rations = 0`)** : La régénération s'arrête et la vitesse baisse de `-8%` tant que le joueur n'a pas prélevé **1 Biche (`+35 🍖`) ou 1 Lapin (`+18 🍖`)** par une chasse raisonnée.
2. **Fertilisation de la Biomasse & Apaisement des Carnivores** :
   - Chaque Biche (`+8`) et Lapin (`+6`) vivant enrichit la biomasse de sa cellule à chaque Eco-Tick et nourrit naturellement les prédateurs sauvages (Loups, Lions, Requins Marcheurs), les empêchant de tomber en famine (`starving`) et de se ruer sur le Bastion.
3. **Danger Collatéral des Sorts AoE & Extinction Irréversible sans Réintroduction (`autoRepopulate: false`)** :
   - Contrairement aux monstres cachés qui réapparaissent gratuitement depuis leurs terriers, **les Biches et les Lapins ne réapparaissent JAMAIS gratuitement si leur population tombe sous `< 2` individus !**
   - Si le joueur lance imprudemment des sorts de zone dévastateurs (*Nova Pyroclastique*, *Météore d'Ambre*, *Éclair en Chaîne*, *Lames Tornades*) au milieu d'une harde et extermine le gibier :
     - **Alerte Écologique immédiate** : *« ⚠️ ALERTE ÉCOLOGIQUE : Troupeau de Biches/Lapins décimé par vos sorts ! Plus de gibier pour vous nourrir — les prédateurs affamés fondent sur le Bastion ! »*
     - **Frénésie de Famine des Carnivores** : Privés de proies naturelles, tous les carnivores sauvages entrent en famine et convergent vers le Bastion.
     - **Réintroduction au Bio-Laboratoire (`25 🌿 Biomasse`)** : Seul le bouton **`🌿 Réintroduire Gibier (25 Biomasse)`** permet de repeupler `3 Biches + 4 Lapins` pour restaurer l'équilibre trophique.

---

## 13. Artefacts RPG : 4 Armes Élémentaires Légendaires, 3 Fragments de Relique & Dôme-Bouclier d'Île

Définis dans [`src/config.js`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/config.js) (`ELEMENTAL_WEAPONS`, `RELIC_FRAGMENTS`, `ISLAND_TIERS`) et [`src/ecosystem/BaseAndQuestsDesign.js`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/ecosystem/BaseAndQuestsDesign.js) (`ELEMENTAL_WEAPONS_CATALOG`, `RELIC_FRAGMENTS_SPEC`, `ISLAND_TIERS_CONFIG`, `getIslandTierSpec`), le système de méta-progression RPG offre un objectif de victoire clair par île tout en personnalisant profondément le style de combat du Héros :

### 13.1. Les 4 Armes Élémentaires Légendaires (`ELEMENTAL_WEAPONS_CATALOG` — Phase 11 Équilibrée `+10%`–`+12%`)
En explorant les **Autels d'Armes Élémentaires (`[E]`)** disséminés sur l'île ou en ouvrant l'**Armurerie des Artefacts (`[K]`)**, le joueur peut choisir et changer à tout moment d'arme élémentaire (recolorant dynamiquement la lame 3D et l'arc de fente du Héros) :

| Arme (`id`) | Élément & Autel 3D | Effets à l'Impact & Passif | Cibles Privilégiées & Synergie Écologique |
| :--- | :--- | :--- | :--- |
| **🔥 Lame Solaire d'Ignis** (`fire_greatsword`) | **Feu** `(34, -28)` | **`+12%` Dégâts de Fente**, inflige **Brûlure Solaire (`8 DPS` / `3.5s`)** et déclenche une **détonation AoE (`18` dég., `5.5m`)** au kill. | **`+15%` dégâts** contre les **Bêtes Sauvages (`wolf`/`lion`)** et les **Taupes Géantes (`giant_mole`)**. |
| **❄️ Espadon Givré de Borée** (`ice_greatsword`) | **Glace** `(-36, -26)` | **`+10%` Dégâts**, **`+12%` Portée**, inflige **Givre (`-35%` vitesse / `3.5s`)** et **brise l'armure `osteo_plating`**. | **`+15%` dégâts** contre les **Mutants Pyro (`pyro_gland`)** et les **Requins Marcheurs (`shark`)**. |
| **⚡ Glaive Foudroyant d'Aether** (`lightning_greatsword`) | **Foudre** `(38, 26)` | **`+10%` Dégâts**, **`+12%` Vit. Attaque**, **`+8%` Vit. Course**, et projette un **Éclair en Chaîne sur 3 ennemis (`12` dég.)**. | **`+15%` dégâts** contre les **Peaux-Vertes (`goblin`/`orc`)** et les créatures amphibies. |
| **🧪 Faux d'Émeraude Symbiotique** (`venom_greatsword`) | **Venin / Biomasse** `(-34, 30)` | **`+10%` Dégâts**, **Venin (`7 DPS`, `-15%` attaque ennemie)**, **`8%` Vol de Vie**, et récolte **`+1 🌿 Biomasse` par kill**. | **🌿 Immunité du Gibier** (`+15%` vs Bêtes/Taupes) : **épargne automatiquement les Biches et Lapins (`0` dégât collatéral !)**. |

### 13.2. Les 3 Fragments de Relique d'Éden, le Dôme-Bouclier Planétaire (`[V]`) & Progression d'Île en Île
1. **Collecte des 3 Monolithes de Relique (`🧩 Reliques : 0/3 → 3/3`)** :
   - Trois monolithes runiques anciens s'élèvent à `~60–75m` du Bastion : **Fragment d'Aube (Nord `(4, -64)`)**, **Fragment des Brisants (Sud-Est `(58, 42)`)** et **Fragment de Caldeira (Sud-Ouest `(-56, 44)`)**.
   - Les Éclaireurs les repèrent sur la Minimap ; s'en approcher et appuyer sur **`[E]`** récupère le fragment (`+50 XP`, `+15 Cristal`).
2. **Activation du Dôme-Bouclier d'Éden (`[V]` à `3/3` Reliques)** :
   - Déploie un **dôme énergétique runique 3D géant (`rayon 115m`)** au-dessus de toute l'île (`spawnIslandShieldDome`), purifiant les monstres hostiles et rendant le Bastion invulnérable (`🛡️ ZONE VALIDÉE`) !
3. **Transition vers l'Île Suivante (`⛵ CAP SUR L'ÎLE SUIVANTE`)** :
   - Le Héros conserve son Niveau, ses Sorts 3D, ses Maîtrises Adaptatives et son **Arme Élémentaire Légendaire**, et accoste sur une nouvelle île plus redoutable :
     - **Île 1 — Archipel d'Émeraude** : Stats `×1.00`, Mutation de base `8%`, Débarquement Requins `40s` / Taupes `65s`.
     - **Île 2 — Caldeira des Abysses** : Stats `×1.35`, Mutation `12%` (`3` mutants initiaux), Requins `24s` / Taupes `38s`.
     - **Île 3 — Terres Mutantes d'Obsidienne** : Stats `×1.75`, Mutation `16%` (`5` mutants initiaux), Requins `16s` / Taupes `26s`.
     - **Île 4+ — Sanctuaire Draconique Primordial** : Stats `×2.20+`, Mutation `20%+` (`7+` mutants initiaux), Requins `12s` / Taupes `18s`.

---

## 14. Mort Roguelike, « Requiem des Cendres » (Lyria 64 BPM) & Dilemme Game Over

En tant que véritable **Action-Roguelike Écologique**, la chute du Gardien (`player.hp <= 0`) ou la destruction du Cœur du Sanctuaire (`bastion.hp <= 0`) met immédiatement le monde en pause et déclenche l'écran solennel **`💀 GAME OVER — FIN DE L'EXPÉDITION`** :

1. **Transition Musicale & Vocale (« Requiem des Cendres » — Lyria 64 BPM)** :
   - Dès l'instant où survient le Game Over (`sound.playGameOverRequiem()`), le moteur musical adaptatif coupe les percussions de combat et bascule sans atténuation modale vers le 5e stem Lyria 3 (`lyria_gameover_requiem.mp3`, **64 BPM en Ré mineur**, violoncelle solo mélancolique, accords de piano lents et chœur funèbre), accompagné de l'élégie vocale française du **Commandant Aldric** (`alert_gameover_requiem.wav`).
2. **Bilan Complet de l'Expédition (6 Cartes Récapitulatives)** :
   - L'écran présente le nom du prédateur ou mutant ayant porté le coup fatal (`Tombé sous les coups de : [...]`), ainsi que les 6 métriques de la run : **Île Atteinte**, **Niveau & Mode de Combat**, **Arme Élémentaire Équipée**, **Sorts 3D & Rangs de Maîtrise**, **Monstres & Mutants Éliminés**, et **Reliques d'Éden & Génération Darwinienne**.
3. **Double Choix : Vraie Règle Roguelike vs Grâce Temporaire du Sanctuaire** :
   - **`🔄 Repartir à Zéro (Nouvelle Run Roguelike — Niv. 1, Île #1)`** : Applique la règle pure du Roguelike (`restartFromZero()`) — réinitialise intégralement le Héros au Niveau 1 (`Espadon Runique`, maîtrises et sorts remis à zéro), reconstruit le Bastion initial et génère un tout nouvel écosystème Gen-1 sur l'Île #1.
   - **`✨ Continuer quand même (Grâce Temporaire du Sanctuaire — 100% PV)`** : Permet au joueur qui souhaite poursuivre son exploration actuelle (`continueAfterGameOver()`) de relever le Gardien au cœur du Bastion avec `100% PV`, `+60 🍖 Rations`, une onde de choc purificatrice et l'intégralité de ses armes, sorts et reliques conservés.

---

## 15. Phase 11 — Rééquilibrage Mathématique des Courbes de Progression (`≤ 1%` par Monstre & Rendements Décroissants)

Afin de préserver la tension darwinienne sur toute la durée d'une campagne multi-îles et d'éviter l'inflation exponentielle des dégâts du joueur, toutes les courbes de progression suivent un **plafond granulaire à rendements décroissants** :

$$\text{BonusChasse}(k) = \begin{cases} 1.0\% \times k & \text{si } 1 \le k \le 5 \quad (\text{max } 5.0\%) \\ 5.0\% + 0.5\% \times (k - 5) & \text{si } 6 \le k \le 15 \quad (\text{max } 10.0\%) \\ \min\big(15.0\%,\; 10.0\% + 0.25\% \times (k - 15)\big) & \text{si } k \ge 16 \quad (\text{plafond à } k = 35) \end{cases}$$

| Système de Progression | Ancienne Valeur (Phases 1–10) | Nouvelle Formule Équilibrée (Phase 11) | Plafond Absolu |
| :--- | :---: | :---: | :---: |
| **Maîtrise par Espèce (`computeSpeciesSlayerBonusPct`)** | `+12%` dès le 1er kill (`+60%` max) | **`+1.0%/kill`** (`1..5`), **`+0.5%/kill`** (`6..15`), **`+0.25%/kill`** (`16+`) | **`+15.0%`** (à `35` kills) |
| **Maîtrise Anti-Mutation (`computeMutationSlayerBonusPct`)** | `+15%` dès le 1er mutant (`+75%` max) | **`+1.0%/kill`** (`1..5`), **`+0.5%/kill`** (`6..15`), **`+0.25%/kill`** (`16+`) | **`+15.0%`** (`+30%` combiné max) |
| **Résistance Élémentaire (`computeResistanceBonusPct`)** | `+9%` par palier (`45%` max) | **`+0.5%/coup`** (`1..6`), **`+0.25%/coup`** (`7..22`), **`+0.15%/coup`** (`23+`) | **`+10.0%`** |
| **Résistance Physique (`computeResistanceBonusPct`)** | `+6%` par palier (`30%` max) | **`+0.4%/coup`** (`1..5`), **`+0.2%/coup`** (`6+`) | **`+6.0%`** |
| **Évolution des Sorts 3D (`getAbilityStatsAtLevel`)** | `+28%` dégâts/niv., `-11%` CD/niv. | **`+8%` dégâts/niv.**, **`+4%` portée/niv.**, **`-4%` CD/niv.** | Niv. 5 = `×1.32` Dégâts, `×0.84` CD |
| **Cartes Passives de Level-Up (`DESIGNED_UPGRADES`)** | `+24%` à `+50%` par carte | **`+8%` à `+12%`** dégâts/vitesse/vision, `+15 PV Max`, `-15%` Dash CD | Cumul additif mesuré |
| **Armes Élémentaires Légendaires (`ELEMENTAL_WEAPONS`)** | `+35%` base, `+45%–50%` vs clade | **`+10%` à `+12%` dégâts de base**, **`+15%` vs clade cible**, `8%` Vol de Vie | Synergie tactique sans power-creep |

