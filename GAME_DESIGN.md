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

## 5. Matrice des Contre-Adaptations Roguelike (`DESIGNED_UPGRADES`)

À chaque montée de niveau (XP gagnée en éliminant des monstres et surtout des Patients Zéro), le système [`pickCounterAdaptationUpgrades`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/ecosystem/BalanceAndPacing.js) analyse l'état actuel de l'écosystème (`hasActivePyro`, `activeMutantCount`, `starvingCount`) pour proposer 3 cartes de contre-adaptation ciblées :

| Amélioration Roguelike | Catégorie | Effet Mécanique Exact | Menace Écologique Contre-Carrée |
| :--- | :--- | :--- | :--- |
| **🎯 Traqueur de Patient Zéro** | Traque Génétique | `+45%` vitesse et `+45%` dégâts de fente en se dirigeant vers ou en combattant une mutation repérée par un Éclaireur. | **Émergence d'un Patient Zéro** dans les confins sauvages avant son passage à l'âge adulte. |
| **🦅 Fauconnerie d'Éclaireur** | Renseignement | `+40%` portée de vision des Éclaireurs hors-frontière ($34 \rightarrow 47.6\text{u}$) et `+25%` vitesse d'expédition/fuite. | **Brouillard de guerre** dans la Caldeira Volcanique et mortalité des Éclaireurs. |
| **🧬 Purge Juvénile & Terre Brûlée** | Écologie Conway | Tuer un mutant ou un Bébé draine **30% de la biomasse** de sa cellule et inflige `+50%` dégâts aux Bébés. | **Cellules à densité optimale (2–5)** : affame artificiellement la meute pour bloquer son prochain Eco-Tick. |
| **🏰 Muraille d'Épines & Balistes** | Bastion | `+180 PV` au Bastion, `+40%` dégâts des Tours de Guet et renvoie `16` dégâts d'épines aux assaillants. | **Migrations de Famine** déclenchées par les cellules en surpopulation ($> 6$). |
| **🛡️ Lame Pyrophage & Égide Cryo** | Contre-Mutation | Réduit de **40%** les dégâts élémentaires (*Feu*, *Venin*, *Givre*) et élargit l'arc d'attaque de `+1.4m`. | **Dominance de la Glande Pyroclastique** (*Trolls de Feu*) et des *Dragons*. |
| **🥾 Bottes d'Expédition Véloce** | Mobilité | `+24%` vitesse permanente et `-30%` temps de recharge d'esquive (Dash). | **Compte à rebours Eco-Tick ($12\text{s}$)** lors des traversées d'un bout à l'autre de l'île. |
| **❤️ Sang d'Ambre Régénérant** | Survie | `+60 PV Max`, soin immédiat de `70 PV` et régénération passive de `+3.0 PV/s`. | **Guerre d'usure** lors des expéditions prolongées loin du feu de camp du Bastion. |

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

## 7. Arsenal des 8 Sorts 3D Évolutifs (`ROGUELIKE_ABILITIES`, Niv. 1 → 5)

Chaque montée de niveau propose 3 cartes tirées via `drawRoguelikeLevelUpChoices()`, permettant de débloquer jusqu'à 4 sorts actifs/auto-cast et de les faire évoluer jusqu'au **Niveau 5** :

| Sort 3D (`id`) | Icône & Catégorie | Dégâts Base → Niv. 5 | Recharge Base → Niv. 5 | Mécanique 3D & Rôle Tactique | Affinité Génétique |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Lames Orbitales** (`spinning_blades`) | 🌀 Orbite 3D Permanente | `18` → `38` / coup | Permanent (`4.5s` pulse) | **2 à 6 lames spectrales** tournent en orbite autour du Héros et tranchent tout ennemi au contact. | `goblin` / `winged_leap` |
| **Nova Pyroclastique** (`pyro_nova`) | 🔥 Explosion de Feu | `42` → `89` (+Brûlure) | `5.2s` → `3.4s` | Onde de choc circulaire de magma (`8.5m` → `12.6m`) calcinant les meutes denses. | `troll` / `pyro_gland` |
| **Arc Foudroyant** (`chain_lightning`) | ⚡ Foudre en Chaîne | `34` → `72` / cible | `3.8s` → `2.5s` | Éclair 3D haute tension rebondissant instantanément de **3 à 7 ennemis**. | `vulture` / `winged_leap` |
| **Javelot Cryogénique** (`frost_spear`) | ❄️ Perforation & Gel | `38` → `81` | `3.2s` → `2.1s` | Lance de glace perforante (`1` à `3` projectiles) qui **ralentit de 50%** : idéal pour bloquer un Patient Zéro ! | `wolf` / `cryo_blood` |
| **Salve Venimeuse** (`venom_volley`) | 🧪 Barrage Toxique | `22` → `47` (+Poison) | `3.6s` → `2.4s` | Éventail de **5 à 13 dagues neurotoxiques** infligeant un lourd poison sur la durée (DoT). | `orc` / `venom_sacs` |
| **Météore d'Ambre** (`meteor_strike`) | ☄️ Frappe Anti-Apex | `68` → `144` (AoE) | `7.0s` → `4.6s` | Cible automatiquement l'ennemi au **plus haut `fitnessScore`** (ou Patient Zéro) et abat un météore explosif. | `dragon` / `titan_growth` |
| **Siphon Vampirique** (`soul_siphon`) | 🩸 Drain Hématophage | `32` → `68` | `5.5s` → `3.6s` | Rayon cramoisi reliant **2 à 6 cibles** au Héros et convertissant **45% à 65%** des dégâts en soin immédiat. | `lion` / `vampiric_maw` |
| **Onde Sismique** (`seismic_slam`) | 🔨 Onde & Stun | `36` → `76` | `5.0s` → `3.3s` | Frappe tellurique qui **repousse violemment (`5.5m+`)** et **étourdit (`1.4s` → `2.4s`)** la horde entourant le joueur. | `troll` / `osteo_plating` |

---

## 8. Apprentissage & Adaptation par l'Action (`AdaptiveMasterySystem`)

Pour que le Héros évolue lui aussi en symbiose avec l'écosystème darwinien, la classe [`AdaptiveMasterySystem`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/ecosystem/RoguelikeAbilitiesAndMastery.js) implémente la loi **"Plus tu fais ou subis X, plus tu deviens fort et résistant face à X"** :

1. **⚔️ Maîtrise de Chasse par Espèce (`recordKill`)** :
   - Paliers rapides : **`1`, `3`, `6`, `10`, `16` éliminations** d'une même espèce (et les deux espèces parentes lorsqu'on tue un hybride comme un *Goblorc*).
   - Dès le **1er kill**, le joueur débloque **Rang 1 (+12% Dégâts contre cette espèce)**, grimpant jusqu'à **+60% au Rang 5**.
2. **🧬 Maîtrise Anti-Mutation & Affinité Élémentaire (`recordKill`)** :
   - Paliers : **`1`, `2`, `4`, `7`, `12` mutants éliminés** d'une même souche (`pyro_gland`, `venom_sacs`, `cryo_blood`, `osteo_plating`, etc.).
   - Confère **+15% Dégâts par rang** (jusqu'à **+75%**) contre tous les porteurs de cette mutation ET multiplie par **$\times 1.75$** la probabilité que l'arbre de Level-Up propose le sort élémentaire correspondant (ex. tuer le *Troll de Feu* favorise l'apparition de la *Nova Pyroclastique* !).
3. **🛡️ Résistance Corporelle Adaptative (`recordDamageTaken`)** :
   - Paliers : **`2`, `5`, `9`, `15`, `22` coups encaissés** dans chacune des 4 catégories (`fire`, `venom`, `cryo`, `physical`).
   - Plus le Héros survit aux flammes, aux toxines, au givre ou aux coups de masse, plus son corps s'immunise :
     - **🔥 Ignifugation Sang-de-Dragon (Feu)** : `+9%` de réduction par rang (**jusqu'à 45%**).
     - **🧪 Immunité Antitoxine (Venin)** : `+9%` de réduction par rang (**jusqu'à 45%**).
     - **❄️ Sang Calorigène (Givre)** : `+9%` de réduction par rang (**jusqu'à 45%**).
     - **🛡️ Endurcissement Ostéo-Dermique (Physique)** : `+6%` de réduction par rang (**jusqu'à 30%**).

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
