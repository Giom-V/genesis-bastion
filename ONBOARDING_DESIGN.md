# GENESIS BASTION — Design de l'Onboarding Guidé des 5–10 Premières Minutes (`ONBOARDING_DESIGN.md`)

> **Objectif UX & Game Design** : Transformer les 5 à 10 premières minutes de *Genesis Bastion* en une montée en puissance limpide, gratifiante et jamais écrasante. Au lieu de parachuter le joueur au milieu de 42 créatures en pleine reproduction de Conway avec 5 panneaux d'interface affichés simultanément, nous appliquons une discipline stricte de **Dévoilement Progressif (*Progressive Disclosure*)** et d'**Apprentissage par l'Action (*Learning by Doing*)**.

---

## 1. Psychologie du Dévoilement Progressif & Gel Écologique Initial

### 1.1. Pourquoi le joueur était submergé au lancement (Diagnostic)
Dans un jeu hybride mêlant *Action-RPG 3D*, *Gestion de Bastion/PNJ* et *Simulation Génétique de Conway*, afficher dès la seconde `0:00` :
- la Barre d'Eco-Tick supérieure,
- le Panneau de gestion du Bastion et des 3 rôles de PNJ à gauche,
- le Laboratoire de simulation,
- le Radar des Lignées Mutantes à droite,
- la Minimap thermique de Conway en bas à droite,
- et 42 monstres sauvages en train de muter,

crée une **surcharge cognitive immédiate**. Le joueur ne sait pas où regarder, ne comprend pas la portée de son arme, ni comment interagir avec une cage ou pourquoi un compteur tourne en haut de l'écran.

### 1.2. Les 4 Règles d'Or de notre Onboarding
1. **Écosystème en Pause (`ecoPaused = true`) pendant les Actes 1 à 6** : Aucun monstre sauvage aléatoire n'existe au démarrage (`0` population sauvage), et le compte à rebours d'Eco-Tick est gelé. Chaque ennemi ou cage rencontré durant les 8 premières minutes est **mis en scène sur mesure** pour enseigner une mécanique précise.
2. **Un Acte = Un Contrôle = Un Panneau Débloqué** : Un panneau du HUD n'apparaît à l'écran **qu'à la seconde exacte où le joueur vient d'en créer le besoin par ses propres mains** (ex. le Panneau du Bastion ne s'ouvre qu'après avoir libéré le 1er Survivant en cage à l'Acte 3 ; la Minimap et le rôle d'Éclaireur ne s'ouvrent qu'à l'Acte 5).
3. **Guidage Spatial 3D Diégétique** :
   - **Flèche Directionnelle 3D Dorée (`questArrowMesh`)** aux pieds du héros pointant vers l'objectif actif (`targetWorldPos`).
   - **Cercle / Arc de Portée d'Attaque 3D** dessiné au sol autour du héros dès qu'un ennemi approche, doublé d'une bulle contextuelle **`[Clic Gauche / Espace : Frapper]`** et de **nombres de dégâts flottants (`-32`)**.
   - **Bulles d'Interaction Contextuelles** (**`[E] Libérer le Survivant`**, **`[E] Récolter`**) au-dessus des cages et gisements.
4. **Filet de Sécurité Pédagogique & Respect des Vétérans** :
   - À l'Acte 6, la maturation du **Bébé Troll de Feu (Patient Zéro)** est plafonnée à `80%` tant que le joueur ne l'a pas rejoint, garantissant que le joueur comprendra et réussira sa première éradication de lignée.
   - Un bouton **`Passer le tutoriel [P]`** reste accessible à tout moment sur la bannière d'onboarding pour les joueurs souhaitant plonger directement dans l'Acte 7.

---

## 2. Table Synthétique des 7 Actes & Matrice de Dévoilement du HUD

L'implémentation de référence se trouve dans [`src/ecosystem/OnboardingSteps.js`](file:///usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion/src/ecosystem/OnboardingSteps.js).

| Acte | Minutage | Titre & Objectif Joueur | Touches Enseignées | Entités Mises en Scène (`spawnSpec`) | Panneaux HUD Déverrouillés (`unlockedHud`) |
| :---: | :---: | :--- | :---: | :--- | :--- |
| **Acte 1** | `0:00 – 1:00` | **Réveil au Bastion & Repères**<br>Marcher jusqu'au fanal doré `(0, 12)` et tester le zoom caméra. | `[Z][Q][S][D]` / `[WASD]`<br>`[Molette]` / `[Q][E]` | Fanal doré `(0, 12)`<br>`0` monstre, `0` PNJ | *Aucun panneau complexe*<br>(Barre PV Héros + Bannière Tutoriel uniquement) |
| **Acte 2** | `1:00 – 2:30` | **Combat, Esquive & 1er Don Roguelike**<br>2A. Tuer le Gobelin Égaré<br>2B. Esquiver `[Shift]` et tuer l'Orc<br>2C. Choisir sa 1re Amélioration (Niv. 2) | `[Clic Gauche]` / `[Espace]`<br>`[Shift]` / `[Clic Droit]` | `1 Gobelin Égaré` à `14m`<br>`1 Orc Maraudeur` à `16m`<br>*(XP calibrée -> Level 2)* | *Aucun panneau supplémentaire*<br>Ouverture ponctuelle de la **Modale Roguelike Level-Up** |
| **Acte 3** | `2:30 – 4:00` | **1er Sauvetage PNJ & Récolte**<br>3A. Vaincre le Loup et libérer la Cage #1 `[E]`<br>3B. Récolter un Arbre ou Cristal `[E]` | `[E]` (Interagir / Libérer / Récolter) | `Cage #1` à `28m` Sud-Est `(20, 20)` + `1 Loup` gardien | 🔓 **Panneau Gauche : Bastion & Survivants** (`leftBastionPanel: true`) |
| **Acte 4** | `4:00 – 5:15` | **Construire la Tour de Guet**<br>4A. Construire `Tour de Guet` (`[1]` ou clic)<br>4B. Repousser les 2 Gobelins Pilleurs | `Clic UI` / `[1]` | `2 Gobelins Pilleurs` attaquant le Bastion après construction | 🔓 **Section Bâtiments du Bastion** (`leftBuildSection: true`) |
| **Acte 5** | `5:15 – 6:45` | **2e Survivant & 1er Éclaireur**<br>5A. Libérer la Cage #2 à `38m` Nord `[E]`<br>5B. Assigner le rôle **`+ Éclaireur`** | `[E]` + Bouton **`+ Éclaireur`** | `Cage #2` à `38m` Nord `(0, -38)` + `1 Orc` gardien | 🔓 **Minimap Radar** (`minimap: true`)<br>🔓 **Bouton Rôle Éclaireur** (`leftScoutRole: true`) |
| **Acte 6** | `6:45 – 8:30` | **Alerte Génétique : Le Bébé Patient Zéro**<br>6A. Suivre le faisceau rouge au Nord-Est et tuer le **Bébé Troll de Feu**<br>6B. Ouvrir le Codex Phylogénétique `[Tab]` | `[Shift]` (Sprint)<br>`[Tab]` (Codex Génétique) | `1 Bébé Troll de Feu` (`pyro_gland`, `lifeStage: 'baby'`, maturation figée à `80%`) à `(46, -46)` | 🔓 **Panneau Droit : Radar Génétique & Lignées** (`rightLineagePanel: true`) + **Alerte Prioritaire Éclaireur** |
| **Acte 7** | `8:30+` | **L'Éveil de l'Écosystème**<br>Fin du tutoriel : le Jeu de la Vie et l'évolution démarrent sur toute l'île ! | `[Tab]`, `[G]` (Grille Conway), `[T]`, `[M]` | `spawnInitialPopulation(42)`<br>`ecoPaused = false` | 🔓 **Barre Supérieure Eco-Tick** (`topEcoBar: true`)<br>🔓 **Labo de Simulation** (`leftLabSection: true`) |

---

## 3. Déroulé Détaillé, Dialogues Pédagogiques & Feedbacks Visuels

### Acte 1 — Réveil au Bastion & Prise en Main (0:00 – 1:00)
* **Mise en scène** : Le héros s'éveille près du feu de camp central `(0, 4)`. L'océan scintille au loin, mais l'île est paisible. Un anneau lumineux doré pulse à `(0, 12)`.
* **Guidage 3D** : Une **flèche directionnelle dorée** aux pieds du héros pointe vers `(0, 12)`.
* **Texte de la Bannière** :
  > *« Bienvenue au Sanctuaire du Bastion. L’île est calme pour l’instant. Déplacez-vous jusqu’au fanal doré près du feu de camp avec **[Z][Q][S][D]** (ou **[W][A][S][D]**) et testez le zoom de votre caméra tactique avec la **[Molette]**. »*
* **Condition de validation** : Le joueur entre dans un rayon de $4\text{m}$ autour de `(0, 12)`.

### Acte 2 — Apprendre à Combattre, Esquiver & Choisir sa 1re Amélioration (1:00 – 2:30)
* **Sous-étape 2A (Portée et Frappe)** :
  - Un **Gobelin Égaré** ($36\text{ PV}$, vitesse réduite) apparaît à $14\text{m}$ au Sud-Est `(10, 10)`.
  - Dès que le joueur s'approche à moins de $8\text{m}$, le **cercle d'arc de portée d'attaque (`5.2m`)** s'illumine au sol autour du héros et une bulle **`[Clic Gauche / Espace : Frapper]`** flotte au-dessus du Gobelin.
  - Chaque coup d'épée affiche un **nombre de dégâts flottant (`-32`)** et un flash d'impact.
* **Sous-étape 2B (Esquive / Dash)** :
  - Une fois le Gobelin vaincu, un **Orc Maraudeur** ($70\text{ PV}$) surgit à `(13, -9)`.
  - Le joueur effectue un **Dash (`[Shift]` ou `[Clic Droit]`)** et terrasse l'Orc.
* **Sous-étape 2C (Récompense Roguelike en Pause Totale & 1re Maîtrise Adaptative)** :
  - Dès le 1er Gobelin éliminé, le joueur voit apparaître sa première maîtrise adaptative : **`⚔️ Maîtrise : Fléau des Gobelins (Rang 1 : +12% Dégâts)`** !
  - L'XP combinée du Gobelin ($45\text{ XP}$) et de l'Orc ($80\text{ XP}$) fait passer le héros au **Niveau 2** !
  - La **Modale d'Amélioration Roguelike** s'ouvre et **met automatiquement le jeu en PAUSE TOTALE (`⏸️ JEU EN PAUSE`)** : le joueur prend tout son temps pour lire et choisir son premier nouveau Sort 3D (ex. *Nova Pyroclastique*, *Arc Foudroyant*, *Javelot Cryogénique*) ou passif.

### Acte 3 — Sauver son 1er Survivant & Récolter des Ressources (2:30 – 4:00)
* **Mise en scène** : Une **Cage de Prisonnier** apparaît à $28\text{m}$ au Sud-Est `(20, 20)`, gardée par un **Loup**.
* **Guidage 3D** : La flèche dorée aux pieds du héros pivote vers `(20, 20)`. À proximité de la cage, une bulle **`[E] Libérer le Survivant`** apparaît.
* **Moment « Eurêka » UX** : Dès que le survivant est libéré, il court vers le Bastion en tant que **Récolteur**, et **le Panneau Gauche (Bastion & Survivants) s'illumine et se déverrouille** !
* **Action finale de l'Acte 3** : Le joueur s'approche d'un arbre ou d'un cristal proche et appuie sur **`[E]`** (ou observe son Récolteur) pour engranger du Bois et du Cristal.

### Acte 4 — Construire son 1er Bâtiment : La Tour de Guet (4:00 – 5:15)
* **Déverrouillage UI** : La section **Bâtiments** du panneau gauche se débloque, et le bouton **`🏹 Tour de Guet`** pulse d'un halo doré.
* **Action & Validation par le Spectacle** :
  - Dès que le joueur clique sur **`Tour de Guet`** (ou appuie sur **`[F1]`**), la tour de bois et de cristal s'élève en 3D au Bastion.
  - Immédiatement, **2 Gobelins Pilleurs** attaquent depuis l'Ouest `(-22, 16)` : la Tour de Guet leur décoche automatiquement des traits lumineux, prouvant au joueur que son Bastion peut désormais se défendre pendant qu'il partira en expédition.

### Acte 5 — Le Tournant du Jeu : 2e Survivant & Recrutement d'un Éclaireur (5:15 – 6:45)
* **Mise en scène** : Une **2e Cage de Survivant** est signalée à $38\text{m}$ au Nord `(0, -38)`.
* **Déverrouillage UI** : Dès que le joueur libère ce 2e survivant avec **`[E]`**, **la Minimap Radar (en bas à droite)** et le bouton de rôle **`+ Éclaireur (Scout)`** s'illuminent !
* **Texte Pédagogique** :
  > *« Les Éclaireurs sont vos yeux sur l'île : trop fragiles pour combattre, ils fuient automatiquement les monstres mais partent en expédition lointaine au-delà de la frontière pour débusquer les mutations ! Cliquez sur **[+ Éclaireur]** dans le panneau gauche. »*
* **Action** : Le joueur clique sur **`+ Éclaireur`**. Sur le terrain 3D et sur la Minimap, l'Éclaireur s'élance aussitôt vers le Nord-Est avec son cercle de vision cyan.

### Acte 6 — L'Alarme Génétique : Traquer le Bébé « Patient Zéro » avant l'Âge Adulte (6:45 – 8:30)
* **Le Climax de l'Onboarding** : L'Éclaireur parti au Nord-Est repère à `(46, -46)` un **Bébé Troll de Feu (`Patient Zéro Juvénile`, porteur de `Glande Pyroclastique`)** !
* **Déverrouillage UI & Alerte** :
  - La **Bannière d'Alerte Éclaireur Prioritaire** retentit en haut de l'écran.
  - Le **Panneau Droit (Radar Génétique & Lignées Mutantes)** se déverrouille.
  - Une **colonne de lumière rouge 3D** s'élève dans le ciel au-dessus du Bébé Troll de Feu.
* **Enseignement de la Règle Bébé → Adulte** :
  > *« 🦅 ALERTE ÉCLAIREUR ! Ce Troll de Feu vient de naître : c'est encore un **BÉBÉ** (taille `0.5x`, stats réduites, **incapable de se reproduire**). Si vous le laissez devenir **ADULTE**, sa mutation dominante (`78%` de transmission) contaminera toute son espèce ! Foncez l'éliminer maintenant ! »*
  - *(Sécurité pédagogique : tant que l'Acte 6 est en cours, la barre de croissance du Bébé Troll de Feu ralentit et plafonne à `80%` afin que le joueur ait la garantie de comprendre la mécanique et de l'abattre avant sa maturité).*
* **Célébration, Maîtrise Anti-Pyro & Codex** :
  - À la mort du Bébé Troll de Feu, la bannière **« 🏆 LIGNÉE MUTANTE ÉRADIQUÉE À TEMPS ! »** s'affiche ET le Héros acquiert **`🧬 Adaptation Génétique : Chasseur [Pyro / Feu] (Rang 1 : +15% Dégâts)`**.
  - Le tutoriel invite le joueur à appuyer sur **`[Tab]`** (en pause sécurisée) pour admirer l'**Arbre Phylogénétique interactif** et le schéma des lois de densité de Conway.

### Acte 7 — L'Éveil de l'Écosystème (8:30+ → Boucle de Survie Infinie)
* **Ouverture Totale** :
  - La **Barre Supérieure d'Eco-Tick** et les **Outils de Laboratoire** se déverrouillent (`FULL_UNLOCKED_HUD`).
  - L'écosystème sort de pause (`ecoPaused = false`) et génère les meutes sauvages sur toute l'île (`spawnInitialPopulation(42)`).
  - Le joueur entre dans la vraie boucle de survie de *Genesis Bastion* en maîtrisant 100% de ses armes, de ses 4 sorts (`[1][2][3][4]` ou `Auto`), de ses constructions (`[F1][F2][F3]`), de ses Éclaireurs et des lois de l'évolution darwinienne.

---

## 4. Choix Initial du Mode de Combat & Pause de Lecture

Avant le début de l'Acte 1 (et permutable à tout moment via **`[C]`**), une modale d'accueil en pause invite le joueur à choisir son confort de jeu :
- **🧛 Mode Vampire Survivors (Auto-Cast)** : Frappe et lancement automatique des sorts 3D dès qu'un ennemi est à portée — idéal pour se concentrer sur le déplacement et la gestion écologique.
- **⚔️ Mode Diablo (Action-RPG)** : Frappe manuelle au `Clic Gauche`/`Espace` et déclenchement tactique des 4 sorts équipés via `[1] [2] [3] [4]`.

---

## 5. Courbe de Tension & Charge Cognitive (Minutes 0 à 10)

```
Tension / Complexité UI
  100% │                                                      ╭──── Acte 7 : Éveil de l'Écosystème
       │                                           ╭──────────╯     (100% HUD + Boucle Conway active)
   75% │                                ╭──────────╯ Acte 6 : Alerte Bébé Patient Zéro (Troll de Feu)
       │                     ╭──────────╯ Acte 5 : 2e Cage + Minimap + 1er Éclaireur
   50% │          ╭──────────╯ Acte 4 : Tour de Guet [F1] + Assaut de 2 Gobelins
       │     ╭────╯ Acte 3 : 1re Cage + Loup + Récolte (Débloque Panneau Bastion)
   25% │  ╭──╯ Acte 2 : Gobelin + Dash Orc + Level-Up en Pause + 1re Maîtrise Adaptative
    0% └──┴────────────────────────────────────────────────────────────────────────────► Temps
      0:00   1:00       2:30       4:00       5:15       6:45       8:30             10:00
```
